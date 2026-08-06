package hu.sourcegraph.explorer.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class SourceGraph {
    private final Map<String, GraphNode> nodes = new LinkedHashMap<>();
    private final List<GraphEdge> edges = new ArrayList<>();
    private final List<String> warnings = new ArrayList<>();
    private String analysisId;

    public void setAnalysisId(String analysisId) {
        this.analysisId = analysisId;
    }

    public String getAnalysisId() {
        return analysisId;
    }

    public void addNode(GraphNode node) {
        nodes.putIfAbsent(node.id(), node);
    }

    public void addEdge(GraphEdge edge) {
        if (!edge.source().equals(edge.target()) && !edges.contains(edge)) {
            edges.add(edge);
        }
    }

    public void addWarning(String warning) {
        warnings.add(warning);
    }

    public GraphNode findNode(String id) {
        return nodes.get(id);
    }

    public List<GraphNode> getNodes() {
        return List.copyOf(nodes.values());
    }

    public List<GraphEdge> getEdges() {
        return List.copyOf(edges);
    }

    public List<String> getWarnings() {
        return List.copyOf(warnings);
    }
}
