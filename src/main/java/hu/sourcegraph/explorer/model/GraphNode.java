package hu.sourcegraph.explorer.model;

import java.util.Map;

public record GraphNode(
        String id,
        String type,
        String name,
        String path,
        Integer line,
        Map<String, String> metadata) {
}
