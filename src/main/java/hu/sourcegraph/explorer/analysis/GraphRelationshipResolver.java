package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.GraphEdge;
import hu.sourcegraph.explorer.model.GraphNode;
import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class GraphRelationshipResolver {

    public void resolve(SourceGraph graph) {
        List<GraphNode> nodes = graph.getNodes();
        List<GraphEdge> edges = graph.getEdges();

        Map<String, GraphNode> byId = nodes.stream().collect(Collectors.toMap(GraphNode::id, node -> node, (a, b) -> a));
        Map<String, List<GraphNode>> typesBySimpleName = nodes.stream()
                .filter(node -> isConcreteJavaType(node.type()))
                .collect(Collectors.groupingBy(node -> node.metadata().getOrDefault("simpleName", node.name())));
        Map<String, List<GraphNode>> methodsByOwnerAndName = nodes.stream()
                .filter(node -> node.type().equals("JAVA_METHOD") || node.type().equals("JAVA_CONSTRUCTOR"))
                .collect(Collectors.groupingBy(node -> methodKey(
                        node.metadata().getOrDefault("ownerQualified", ""),
                        node.metadata().getOrDefault("methodName", node.name()))));

        Map<String, Map<String, String>> injectedTypesByOwner = new HashMap<>();
        for (GraphEdge edge : edges) {
            if (!edge.type().equals("INJECTS")) continue;
            GraphNode owner = byId.get(edge.source());
            GraphNode target = resolveConcreteTarget(byId.get(edge.target()), typesBySimpleName);
            if (owner != null && target != null) {
                injectedTypesByOwner.computeIfAbsent(owner.metadata().getOrDefault("qualifiedName", owner.name()), key -> new HashMap<>())
                        .put(edge.detail(), target.metadata().getOrDefault("qualifiedName", target.name()));
                graph.addEdge(GraphSupport.edge(owner.id(), target.id(), "INJECTS", "RESOLVED", edge.detail()));
            }
        }

        for (GraphEdge edge : new ArrayList<>(graph.getEdges())) {
            GraphNode target = byId.get(edge.target());
            if (target != null && target.type().equals("JAVA_TYPE_REFERENCE")) {
                GraphNode resolved = resolveConcreteTarget(target, typesBySimpleName);
                if (resolved != null) {
                    graph.addEdge(GraphSupport.edge(edge.source(), resolved.id(), edge.type(), "RESOLVED", edge.detail()));
                }
            }
        }

        for (GraphNode callRef : nodes) {
            if (!callRef.type().equals("JAVA_CALL_REFERENCE")) continue;
            String ownerQualified = callRef.metadata().getOrDefault("ownerQualified", "");
            String scope = callRef.metadata().getOrDefault("scope", "");
            String methodName = callRef.metadata().getOrDefault("methodName", callRef.name());
            String targetOwner = null;
            if (!scope.isBlank()) {
                targetOwner = injectedTypesByOwner.getOrDefault(ownerQualified, Map.of()).get(scope);
                if (targetOwner == null && Character.isUpperCase(scope.charAt(0))) {
                    List<GraphNode> candidates = typesBySimpleName.get(scope);
                    if (candidates != null && candidates.size() == 1) {
                        targetOwner = candidates.get(0).metadata().getOrDefault("qualifiedName", candidates.get(0).name());
                    }
                }
            }
            if (targetOwner == null) continue;

            List<GraphNode> targetMethods = methodsByOwnerAndName.getOrDefault(methodKey(targetOwner, methodName), List.of());
            Set<String> callers = graph.getEdges().stream()
                    .filter(edge -> edge.target().equals(callRef.id()) && edge.type().equals("CALLS"))
                    .map(GraphEdge::source).collect(Collectors.toSet());
            for (String caller : callers) {
                if (!targetMethods.isEmpty()) {
                    targetMethods.forEach(targetMethod -> graph.addEdge(GraphSupport.edge(
                            caller, targetMethod.id(), "CALLS", "RESOLVED", scope + "." + methodName)));
                } else {
                    GraphNode targetType = byId.get("java-type:" + targetOwner);
                    if (targetType != null) {
                        graph.addEdge(GraphSupport.edge(caller, targetType.id(), "CALLS_COMPONENT", "RESOLVED", scope + "." + methodName));
                    }
                }
            }
        }

        connectEndpoints(graph);
        connectApplicationEntries(graph);
    }

    private void connectApplicationEntries(SourceGraph graph) {
        List<GraphNode> entries = graph.getNodes().stream()
                .filter(node -> node.type().equals("JAVA_APPLICATION_ENTRY")).toList();
        List<GraphNode> components = graph.getNodes().stream()
                .filter(node -> node.type().equals("JAVA_CONTROLLER")).toList();
        for (GraphNode entry : entries) {
            for (GraphNode component : components) {
                graph.addEdge(GraphSupport.edge(entry.id(), component.id(), "SCANS_COMPONENT", "INFERRED", "Spring component scan"));
            }
        }
    }

    private void connectEndpoints(SourceGraph graph) {
        Map<String, GraphNode> endpoints = graph.getNodes().stream()
                .filter(node -> node.type().equals("REST_ENDPOINT"))
                .collect(Collectors.toMap(node -> normalizePath(node.metadata().getOrDefault("path", node.name())), node -> node, (a, b) -> a));
        for (GraphNode endpoint : graph.getNodes()) {
            if (!endpoint.type().equals("REST_ENDPOINT")) continue;
            String normalized = normalizePath(endpoint.metadata().getOrDefault("path", endpoint.name()));
            GraphNode canonical = endpoints.get(normalized);
            if (canonical != null && !canonical.id().equals(endpoint.id())) {
                graph.addEdge(GraphSupport.edge(endpoint.id(), canonical.id(), "SAME_ENDPOINT", "RESOLVED", normalized));
            }
        }
    }

    private GraphNode resolveConcreteTarget(GraphNode reference, Map<String, List<GraphNode>> typesBySimpleName) {
        if (reference == null) return null;
        if (isConcreteJavaType(reference.type())) return reference;
        String qualified = reference.metadata().getOrDefault("qualifiedName", reference.name());
        String simple = simpleName(qualified);
        List<GraphNode> candidates = typesBySimpleName.getOrDefault(simple, List.of());
        if (candidates.size() == 1) return candidates.get(0);
        return candidates.stream().filter(node -> qualified.equals(node.metadata().get("qualifiedName"))).findFirst().orElse(null);
    }

    private boolean isConcreteJavaType(String type) {
        return type.startsWith("JAVA_") && !type.equals("JAVA_TYPE_REFERENCE")
                && !type.equals("JAVA_METHOD") && !type.equals("JAVA_CONSTRUCTOR") && !type.equals("JAVA_CALL_REFERENCE");
    }

    private String methodKey(String owner, String method) {
        return owner + "#" + method;
    }

    private String simpleName(String qualified) {
        int dot = qualified.lastIndexOf('.');
        return dot >= 0 ? qualified.substring(dot + 1) : qualified;
    }

    private String normalizePath(String raw) {
        if (raw == null || raw.isBlank()) return "/";
        String value = raw.trim();
        int query = value.indexOf('?');
        if (query >= 0) value = value.substring(0, query);
        value = value.replaceAll("\\$\\{[^}]+}", "{value}");
        if (!value.startsWith("/")) value = "/" + value;
        return value.replaceAll("/+", "/");
    }
}
