package hu.sourcegraph.explorer.ai;

import hu.sourcegraph.explorer.api.AnalysisSessionStore;
import hu.sourcegraph.explorer.model.GraphEdge;
import hu.sourcegraph.explorer.model.GraphNode;
import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class ProjectKnowledgeService {
    private static final int MAX_NODES = 18;
    private static final int MAX_SOURCE_FILES = 8;
    private static final int MAX_SOURCE_CHARS_PER_FILE = 7000;
    private static final int MAX_TOTAL_CONTEXT_CHARS = 52000;
    private static final Pattern WORD_SPLIT = Pattern.compile("[^\\p{L}\\p{N}_./:-]+");

    private final AnalysisSessionStore sessionStore;
    private final VectorKnowledgeIndexService vectorIndexService;

    public ProjectKnowledgeService(AnalysisSessionStore sessionStore, VectorKnowledgeIndexService vectorIndexService) {
        this.sessionStore = sessionStore;
        this.vectorIndexService = vectorIndexService;
    }

    public ContextResult buildContext(String analysisId, String question, String selectedNodeId) throws IOException, InterruptedException {
        long totalStarted = System.nanoTime();
        long graphStarted = System.nanoTime();
        SourceGraph graph = sessionStore.requireGraph(analysisId);
        long graphLoadDurationNanos = System.nanoTime() - graphStarted;

        long selectionStarted = System.nanoTime();
        List<String> terms = terms(question);
        Map<String, Integer> scores = new LinkedHashMap<>();
        VectorKnowledgeIndexService.SearchResult vectorSearch = vectorIndexService.search(analysisId, question, 12);
        int vectorRank = 0;
        for (VectorKnowledgeIndexService.VectorHit hit : vectorSearch.hits()) {
            scores.merge(hit.nodeId(), Math.max(80, 420 - vectorRank * 25), Integer::sum);
            vectorRank++;
        }
        if (selectedNodeId != null && graph.findNode(selectedNodeId) != null) {
            scores.put(selectedNodeId, 1000);
            addNeighbours(graph, selectedNodeId, scores, 350);
        }
        for (GraphNode node : graph.getNodes()) {
            int score = relevance(node, terms);
            if (score > 0) scores.merge(node.id(), score, Integer::sum);
        }
        if (scores.isEmpty()) {
            graph.getNodes().stream().limit(MAX_NODES).forEach(node -> scores.put(node.id(), 1));
        }

        List<GraphNode> nodes = scores.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .map(entry -> graph.findNode(entry.getKey()))
                .filter(java.util.Objects::nonNull)
                .limit(MAX_NODES)
                .toList();
        Set<String> ids = nodes.stream().map(GraphNode::id).collect(java.util.stream.Collectors.toSet());
        List<GraphEdge> edges = graph.getEdges().stream()
                .filter(edge -> ids.contains(edge.source()) && ids.contains(edge.target()))
                .limit(50)
                .toList();
        long selectionDurationNanos = System.nanoTime() - selectionStarted;

        long serializationStarted = System.nanoTime();
        StringBuilder context = new StringBuilder();
        context.append("ELEMZETT PROJEKT GRÁFKONTEXTUSA\n\nCSOMÓPONTOK:\n");
        for (GraphNode node : nodes) {
            context.append("- [").append(node.id()).append("] ")
                    .append(node.type()).append(" | ").append(node.name())
                    .append(" | ").append(node.path());
            if (node.line() != null) context.append(':').append(node.line());
            if (node.metadata() != null && !node.metadata().isEmpty()) context.append(" | ").append(node.metadata());
            context.append('\n');
        }
        context.append("\nKAPCSOLATOK:\n");
        for (GraphEdge edge : edges) {
            context.append("- ").append(edge.source()).append(" --[").append(edge.type())
                    .append('/').append(edge.confidence()).append("]--> ").append(edge.target());
            if (edge.detail() != null && !edge.detail().isBlank()) context.append(" | ").append(edge.detail());
            context.append('\n');
        }

        long graphSerializationDurationNanos = System.nanoTime() - serializationStarted;

        long sourceStarted = System.nanoTime();
        Set<String> sourcePaths = new LinkedHashSet<>();
        if (selectedNodeId != null) {
            GraphNode selected = graph.findNode(selectedNodeId);
            if (selected != null && selected.path() != null) sourcePaths.add(selected.path());
        }
        nodes.stream().map(GraphNode::path).filter(path -> path != null && !path.isBlank()).forEach(sourcePaths::add);
        List<SourceReference> references = new ArrayList<>();
        context.append("\nFORRÁSKÓD-RÉSZLETEK:\n");
        int fileCount = 0;
        for (String path : sourcePaths) {
            if (fileCount >= MAX_SOURCE_FILES || context.length() >= MAX_TOTAL_CONTEXT_CHARS) break;
            try {
                AnalysisSessionStore.SourceViewResponse source = sessionStore.readSource(analysisId, path);
                String excerpt = source.content();
                if (excerpt.length() > MAX_SOURCE_CHARS_PER_FILE) excerpt = excerpt.substring(0, MAX_SOURCE_CHARS_PER_FILE) + "\n…[rövidítve]";
                context.append("\n--- FILE: ").append(source.path()).append(" ---\n").append(excerpt).append('\n');
                Integer line = nodes.stream().filter(node -> path.equals(node.path()) && node.line() != null)
                        .map(GraphNode::line).min(Comparator.naturalOrder()).orElse(1);
                references.add(new SourceReference(path, line));
                fileCount++;
            } catch (IllegalArgumentException ignored) {
                // Some graph nodes represent logical paths rather than directly readable source files.
            }
        }
        long sourceReadDurationNanos = System.nanoTime() - sourceStarted;
        long totalDurationNanos = System.nanoTime() - totalStarted;
        return new ContextResult(context.toString(), nodes.size(), edges.size(), references,
                vectorSearch.indexReady(), vectorSearch.model(), vectorSearch.hits(), vectorSearch.durationNanos(),
                graphLoadDurationNanos, selectionDurationNanos, graphSerializationDurationNanos,
                sourceReadDurationNanos, totalDurationNanos, fileCount);
    }

    private static void addNeighbours(SourceGraph graph, String nodeId, Map<String, Integer> scores, int score) {
        for (GraphEdge edge : graph.getEdges()) {
            if (nodeId.equals(edge.source())) scores.merge(edge.target(), score, Integer::sum);
            if (nodeId.equals(edge.target())) scores.merge(edge.source(), score, Integer::sum);
        }
    }

    private static int relevance(GraphNode node, List<String> terms) {
        if (terms.isEmpty()) return 0;
        String haystack = ((node.name() == null ? "" : node.name()) + " "
                + (node.path() == null ? "" : node.path()) + " "
                + (node.type() == null ? "" : node.type()) + " "
                + (node.metadata() == null ? "" : node.metadata())).toLowerCase(Locale.ROOT);
        int score = 0;
        for (String term : terms) {
            if (haystack.contains(term)) score += term.length() >= 5 ? 35 : 15;
            if (node.name() != null && node.name().toLowerCase(Locale.ROOT).contains(term)) score += 45;
        }
        return score;
    }

    private static List<String> terms(String question) {
        if (question == null) return List.of();
        Set<String> stop = new HashSet<>(Set.of("hogy", "hogyan", "milyen", "mi", "mit", "az", "egy", "és", "vagy", "van", "kell", "ennek", "ebben", "this", "that", "what", "how", "the", "and", "with"));
        return java.util.Arrays.stream(WORD_SPLIT.split(question.toLowerCase(Locale.ROOT)))
                .filter(word -> word.length() >= 3 && !stop.contains(word))
                .distinct().limit(12).toList();
    }

    public record SourceReference(String path, Integer line) {}
    public record ContextResult(String context, int nodeCount, int edgeCount, List<SourceReference> references,
                                boolean vectorIndexUsed, String embeddingModel,
                                List<VectorKnowledgeIndexService.VectorHit> vectorHits, long vectorSearchDurationNanos,
                                long graphLoadDurationNanos, long selectionDurationNanos,
                                long graphSerializationDurationNanos, long sourceReadDurationNanos,
                                long totalDurationNanos, int sourceFileCount) {}
}
