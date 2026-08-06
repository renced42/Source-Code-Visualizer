package hu.sourcegraph.explorer.model;

public record GraphEdge(
        String source,
        String target,
        String type,
        String confidence,
        String detail) {
}
