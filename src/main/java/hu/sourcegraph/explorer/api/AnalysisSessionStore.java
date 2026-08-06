package hu.sourcegraph.explorer.api;

import hu.sourcegraph.explorer.model.SourceGraph;
import hu.sourcegraph.explorer.util.FileTreeCleaner;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@Component
public class AnalysisSessionStore {
    private static final long MAX_SOURCE_FILE_SIZE = 2L * 1024L * 1024L;

    private String analysisId;
    private Path root;
    private SourceGraph graph;

    public synchronized String replace(Path newRoot, SourceGraph newGraph) {
        clear();
        analysisId = UUID.randomUUID().toString();
        root = newRoot.toAbsolutePath().normalize();
        graph = newGraph;
        return analysisId;
    }

    public synchronized SourceGraph requireGraph(String requestedAnalysisId) {
        requireActive(requestedAnalysisId);
        return graph;
    }

    private void requireActive(String requestedAnalysisId) {
        if (analysisId == null || !analysisId.equals(requestedAnalysisId) || root == null || graph == null) {
            throw new IllegalArgumentException("Az elemzési munkamenet már nem érhető el.");
        }
    }

    public synchronized SourceViewResponse readSource(String requestedAnalysisId, String relativePath) throws IOException {
        requireActive(requestedAnalysisId);
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("Forrásfájl útvonala szükséges.");
        }
        Path file = root.resolve(relativePath.replace('\\', '/')).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            throw new IllegalArgumentException("A forrásfájl nem található az elemzett projektben.");
        }
        long size = Files.size(file);
        if (size > MAX_SOURCE_FILE_SIZE) {
            throw new IllegalArgumentException("A forrásfájl túl nagy a beépített kódnézethez (maximum 2 MB).");
        }
        String content = Files.readString(file, StandardCharsets.UTF_8);
        return new SourceViewResponse(relativePath.replace('\\', '/'), languageFor(relativePath), content);
    }

    private String languageFor(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".java")) return "java";
        if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
        if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
        if (lower.endsWith(".html") || lower.endsWith(".htm") || lower.endsWith(".jsp")) return "html";
        if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".sass")) return "css";
        if (lower.endsWith(".xml")) return "xml";
        if (lower.endsWith(".json")) return "json";
        if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
        if (lower.endsWith(".sql")) return "sql";
        if (lower.endsWith(".properties")) return "properties";
        return "text";
    }

    @PreDestroy
    public synchronized void clear() {
        FileTreeCleaner.deleteRecursively(root);
        root = null;
        analysisId = null;
        graph = null;
    }

    public record SourceViewResponse(String path, String language, String content) {}
}
