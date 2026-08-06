package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.GraphEdge;
import hu.sourcegraph.explorer.model.GraphNode;

import java.util.Map;

final class GraphSupport {
    private GraphSupport() {
    }

    static GraphNode fileNode(String relativePath) {
        return new GraphNode(fileId(relativePath), "SOURCE_FILE", fileName(relativePath), relativePath, null,
                Map.of("extension", extension(relativePath)));
    }

    static GraphNode node(String id, String type, String name, String path, Integer line) {
        return node(id, type, name, path, line, Map.of());
    }

    static GraphNode node(String id, String type, String name, String path, Integer line, Map<String, String> metadata) {
        return new GraphNode(id, type, name, path, line, metadata == null ? Map.of() : Map.copyOf(metadata));
    }

    static GraphEdge edge(String source, String target, String type, String confidence, String detail) {
        return new GraphEdge(source, target, type, confidence, detail);
    }

    static String fileId(String path) {
        return "file:" + path.replace('\\', '/');
    }

    static String fileName(String path) {
        int slash = path.lastIndexOf('/');
        return slash >= 0 ? path.substring(slash + 1) : path;
    }

    static String extension(String path) {
        int dot = path.lastIndexOf('.');
        return dot >= 0 ? path.substring(dot + 1).toLowerCase() : "";
    }
}
