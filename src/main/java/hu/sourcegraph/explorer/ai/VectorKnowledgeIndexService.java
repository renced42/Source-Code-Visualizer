package hu.sourcegraph.explorer.ai;

import hu.sourcegraph.explorer.api.AnalysisSessionStore;
import hu.sourcegraph.explorer.model.GraphNode;
import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class VectorKnowledgeIndexService {
    private static final int MAX_DOCUMENT_CHARACTERS = 3600;
    private static final int SOURCE_RADIUS_LINES = 18;
    private static final int CACHE_MAGIC = 0x53474556; // SGEV
    private static final int CACHE_VERSION = 1;
    private static final int MAX_VECTOR_DIMENSIONS = 65_536;

    private final AnalysisSessionStore sessionStore;
    private final OllamaClient ollamaClient;
    private final String embeddingModel;
    private final int embeddingBatchSize;
    private final Path vectorCacheDirectory;
    private final AtomicBoolean cancelRequested = new AtomicBoolean(false);
    private volatile IndexSnapshot snapshot;
    private volatile BuildState buildState = BuildState.empty();

    public VectorKnowledgeIndexService(
            AnalysisSessionStore sessionStore,
            OllamaClient ollamaClient,
            @Value("${app.ai.ollama.embedding-model:qwen3-embedding:0.6b}") String embeddingModel,
            @Value("${app.ai.ollama.embedding-batch-size:4}") int embeddingBatchSize,
            @Value("${app.ai.ollama.vector-cache-dir:${user.home}/.source-graph-explorer/vector-cache}") String vectorCacheDirectory) {
        this.sessionStore = sessionStore;
        this.ollamaClient = ollamaClient;
        this.embeddingModel = embeddingModel;
        this.embeddingBatchSize = Math.max(1, Math.min(embeddingBatchSize, 64));
        this.vectorCacheDirectory = Path.of(vectorCacheDirectory).toAbsolutePath().normalize();
    }

    public synchronized IndexStatus build(String analysisId) throws IOException, InterruptedException {
        SourceGraph graph = sessionStore.requireGraph(analysisId);
        long started = System.nanoTime();
        cancelRequested.set(false);
        List<IndexDocument> documents = createDocuments(analysisId, graph);
        buildState = new BuildState(true, false, false, analysisId, 0, documents.size(), 0, documents.size(), started, null);
        try {
            Map<String, float[]> cachedVectors = loadVectorCache();
            List<IndexedDocument> indexed = new ArrayList<>(documents.size());
            List<IndexDocument> missing = new ArrayList<>();
            for (IndexDocument document : documents) {
                float[] cached = cachedVectors.get(document.contentHash());
                if (cached == null || cached.length == 0) {
                    missing.add(document);
                } else {
                    indexed.add(new IndexedDocument(document, cached));
                }
            }
            int reused = indexed.size();
            buildState = new BuildState(true, false, false, analysisId, reused, documents.size(), reused, missing.size(), started, null);

            for (int offset = 0; offset < missing.size(); offset += embeddingBatchSize) {
                checkCancelled();
                int end = Math.min(missing.size(), offset + embeddingBatchSize);
                List<IndexDocument> batch = missing.subList(offset, end);
                List<float[]> vectors = ollamaClient.embed(embeddingModel, batch.stream().map(IndexDocument::text).toList());
                checkCancelled();
                if (vectors.size() != batch.size()) {
                    throw new IllegalStateException("Az Ollama embedding válasz elemszáma eltér a kérésétől.");
                }
                List<CacheEntry> cacheEntries = new ArrayList<>(batch.size());
                for (int i = 0; i < batch.size(); i++) {
                    float[] normalized = normalize(vectors.get(i));
                    indexed.add(new IndexedDocument(batch.get(i), normalized));
                    cacheEntries.add(new CacheEntry(batch.get(i).contentHash(), normalized));
                }
                appendVectorCache(cacheEntries);
                int processed = reused + end;
                buildState = new BuildState(true, false, false, analysisId, processed, documents.size(), reused,
                        Math.max(0, missing.size() - end), started, null);
            }
            snapshot = new IndexSnapshot(analysisId, embeddingModel, List.copyOf(indexed), System.nanoTime() - started);
            buildState = new BuildState(false, false, false, analysisId, indexed.size(), indexed.size(), reused, 0, started, null);
            return status(analysisId);
        } catch (IndexBuildCancelledException exception) {
            BuildState current = buildState;
            buildState = new BuildState(false, false, true, analysisId, current.processed(), current.total(),
                    current.reused(), current.missing(), current.startedNanos(), null);
            return status(analysisId);
        } catch (IOException | InterruptedException | RuntimeException exception) {
            BuildState current = buildState;
            buildState = new BuildState(false, false, false, analysisId, current.processed(), current.total(),
                    current.reused(), current.missing(), current.startedNanos(), safeMessage(exception));
            throw exception;
        } finally {
            cancelRequested.set(false);
        }
    }

    public IndexStatus status(String analysisId) {
        IndexSnapshot current = snapshot;
        boolean ready = current != null && current.analysisId().equals(analysisId);
        BuildState currentBuild = buildState;
        boolean activeBuild = currentBuild.building() && analysisId != null && analysisId.equals(currentBuild.analysisId());
        long elapsedNanos = activeBuild && currentBuild.startedNanos() > 0
                ? Math.max(0, System.nanoTime() - currentBuild.startedNanos())
                : (ready ? current.buildDurationNanos() : 0);
        double documentsPerSecond = currentBuild.processed() > currentBuild.reused() && elapsedNanos > 0
                ? (currentBuild.processed() - currentBuild.reused()) / (elapsedNanos / 1_000_000_000.0)
                : 0;
        long estimatedRemainingNanos = documentsPerSecond > 0 && currentBuild.total() > currentBuild.processed()
                ? (long) (((currentBuild.total() - currentBuild.processed()) / documentsPerSecond) * 1_000_000_000.0)
                : 0;
        return new IndexStatus(
                ready,
                activeBuild,
                currentBuild.cancelling() && analysisId != null && analysisId.equals(currentBuild.analysisId()),
                currentBuild.cancelled() && analysisId != null && analysisId.equals(currentBuild.analysisId()),
                embeddingModel, embeddingBatchSize,
                ready ? current.documents().size() : 0,
                currentBuild.processed(), currentBuild.total(), currentBuild.reused(), currentBuild.missing(),
                ready ? current.buildDurationNanos() : 0,
                elapsedNanos, documentsPerSecond, estimatedRemainingNanos,
                vectorCacheDirectory.toString(), currentBuild.error());
    }

    public IndexStatus cancel(String analysisId) {
        BuildState current = buildState;
        if (current.building() && analysisId != null && analysisId.equals(current.analysisId())) {
            cancelRequested.set(true);
            buildState = new BuildState(true, true, false, current.analysisId(), current.processed(), current.total(),
                    current.reused(), current.missing(), current.startedNanos(), null);
        }
        return status(analysisId);
    }

    private void checkCancelled() {
        if (cancelRequested.get() || Thread.currentThread().isInterrupted()) {
            throw new IndexBuildCancelledException();
        }
    }

    public SearchResult search(String analysisId, String query, int limit) throws IOException, InterruptedException {
        IndexSnapshot current = snapshot;
        if (current == null || !current.analysisId().equals(analysisId)) {
            return new SearchResult(false, embeddingModel, List.of(), 0);
        }
        long started = System.nanoTime();
        List<float[]> queryVectors = ollamaClient.embed(embeddingModel, List.of(query));
        if (queryVectors.isEmpty()) return new SearchResult(true, embeddingModel, List.of(), System.nanoTime() - started);
        float[] queryVector = normalize(queryVectors.get(0));
        List<VectorHit> hits = current.documents().stream()
                .map(document -> new VectorHit(document.document().nodeId(), document.document().path(),
                        document.document().line(), document.document().type(), document.document().name(),
                        dot(queryVector, document.vector())))
                .sorted(Comparator.comparingDouble(VectorHit::score).reversed())
                .limit(Math.max(1, Math.min(limit, 50)))
                .toList();
        return new SearchResult(true, embeddingModel, hits, System.nanoTime() - started);
    }

    private List<IndexDocument> createDocuments(String analysisId, SourceGraph graph) {
        Map<String, String[]> sourceCache = new LinkedHashMap<>();
        List<IndexDocument> documents = new ArrayList<>();
        for (GraphNode node : graph.getNodes()) {
            StringBuilder text = new StringBuilder();
            text.append("Típus: ").append(value(node.type())).append('\n');
            text.append("Név: ").append(value(node.name())).append('\n');
            text.append("Fájl: ").append(value(node.path()));
            if (node.line() != null) text.append(':').append(node.line());
            text.append('\n');
            if (node.metadata() != null && !node.metadata().isEmpty()) {
                text.append("Metaadatok: ").append(node.metadata()).append('\n');
            }
            String excerpt = sourceExcerpt(analysisId, node, sourceCache);
            if (!excerpt.isBlank()) text.append("Forrásrészlet:\n").append(excerpt);
            if (text.length() > MAX_DOCUMENT_CHARACTERS) text.setLength(MAX_DOCUMENT_CHARACTERS);
            String documentText = text.toString();
            documents.add(new IndexDocument(node.id(), node.path(), node.line(), node.type(), node.name(),
                    documentText, sha256(documentText)));
        }
        return documents;
    }

    private String sourceExcerpt(String analysisId, GraphNode node, Map<String, String[]> cache) {
        if (node.path() == null || node.path().isBlank()) return "";
        try {
            String[] lines = cache.computeIfAbsent(node.path(), path -> {
                try {
                    return sessionStore.readSource(analysisId, path).content().split("\\R", -1);
                } catch (IOException | IllegalArgumentException exception) {
                    return new String[0];
                }
            });
            if (lines.length == 0) return "";
            int center = node.line() == null ? 1 : Math.max(1, node.line());
            int from = Math.max(0, center - 1 - SOURCE_RADIUS_LINES);
            int to = Math.min(lines.length, center + SOURCE_RADIUS_LINES);
            StringBuilder excerpt = new StringBuilder();
            for (int i = from; i < to; i++) excerpt.append(i + 1).append(": ").append(lines[i]).append('\n');
            return excerpt.toString();
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private Map<String, float[]> loadVectorCache() throws IOException {
        Path file = cacheFile();
        Map<String, float[]> cache = new LinkedHashMap<>();
        if (!Files.isRegularFile(file)) return cache;
        try (DataInputStream input = new DataInputStream(new BufferedInputStream(Files.newInputStream(file)))) {
            int magic = input.readInt();
            int version = input.readInt();
            if (magic != CACHE_MAGIC || version != CACHE_VERSION) return cache;
            while (true) {
                try {
                    String hash = input.readUTF();
                    int dimension = input.readInt();
                    if (dimension <= 0 || dimension > MAX_VECTOR_DIMENSIONS) break;
                    float[] vector = new float[dimension];
                    for (int i = 0; i < dimension; i++) vector[i] = input.readFloat();
                    cache.put(hash, vector);
                } catch (EOFException incompleteTail) {
                    break;
                }
            }
        }
        return cache;
    }

    private void appendVectorCache(List<CacheEntry> entries) throws IOException {
        if (entries.isEmpty()) return;
        Path file = cacheFile();
        Files.createDirectories(file.getParent());
        boolean newFile = !Files.exists(file) || Files.size(file) == 0;
        try (DataOutputStream output = new DataOutputStream(new BufferedOutputStream(Files.newOutputStream(file,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.APPEND)))) {
            if (newFile) {
                output.writeInt(CACHE_MAGIC);
                output.writeInt(CACHE_VERSION);
            }
            for (CacheEntry entry : entries) {
                output.writeUTF(entry.contentHash());
                output.writeInt(entry.vector().length);
                for (float value : entry.vector()) output.writeFloat(value);
            }
            output.flush();
        }
    }

    private Path cacheFile() {
        return vectorCacheDirectory.resolve(sha256(embeddingModel).substring(0, 16)).resolve("vectors.bin");
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 nem érhető el.", impossible);
        }
    }

    private static float[] normalize(float[] vector) {
        double sum = 0;
        for (float value : vector) sum += value * value;
        double length = Math.sqrt(sum);
        if (length == 0) return vector;
        float[] normalized = new float[vector.length];
        for (int i = 0; i < vector.length; i++) normalized[i] = (float) (vector[i] / length);
        return normalized;
    }

    private static double dot(float[] left, float[] right) {
        int length = Math.min(left.length, right.length);
        double result = 0;
        for (int i = 0; i < length; i++) result += left[i] * right[i];
        return result;
    }

    private static String value(String value) { return value == null ? "" : value; }
    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }

    private record IndexDocument(String nodeId, String path, Integer line, String type, String name, String text, String contentHash) {}
    private record IndexedDocument(IndexDocument document, float[] vector) {}
    private record CacheEntry(String contentHash, float[] vector) {}
    private record IndexSnapshot(String analysisId, String model, List<IndexedDocument> documents, long buildDurationNanos) {}
    private record BuildState(boolean building, boolean cancelling, boolean cancelled, String analysisId,
                              int processed, int total, int reused, int missing, long startedNanos, String error) {
        private static BuildState empty() { return new BuildState(false, false, false, null, 0, 0, 0, 0, 0, null); }
    }

    private static final class IndexBuildCancelledException extends RuntimeException {
        private IndexBuildCancelledException() { super("A RAG index készítése megszakítva."); }
    }

    public record VectorHit(String nodeId, String path, Integer line, String type, String name, double score) {}
    public record SearchResult(boolean indexReady, String model, List<VectorHit> hits, long durationNanos) {}
    public record IndexStatus(boolean ready, boolean building, boolean cancelling, boolean cancelled,
                              String model, int batchSize, int documentCount, int processed, int total,
                              int reusedDocumentCount, int missingDocumentCount,
                              long buildDurationNanos, long elapsedNanos, double documentsPerSecond,
                              long estimatedRemainingNanos, String cacheDirectory, String error) {}
}
