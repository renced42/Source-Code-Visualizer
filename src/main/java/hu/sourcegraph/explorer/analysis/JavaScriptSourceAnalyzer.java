package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Order(20)
public class JavaScriptSourceAnalyzer implements SourceFileAnalyzer {
    private static final Pattern IMPORT = Pattern.compile("(?:import\\s+(?:[^;]*?\\s+from\\s+)?|require\\s*\\()(['\\\"])([^'\\\"]+)\\1");
    private static final Pattern FETCH = Pattern.compile("(?:fetch|axios\\.(?:get|post|put|patch|delete))\\s*\\(\\s*(['\\\"])([^'\\\"]+)\\1");
    private static final Pattern SELECTOR = Pattern.compile("(?:querySelector(?:All)?|getElementById)\\s*\\(\\s*(['\\\"])([^'\\\"]+)\\1");
    private static final Pattern FUNCTION = Pattern.compile("(?:function\\s+([A-Za-z_$][\\w$]*)|(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>)");

    @Override
    public boolean supports(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        return name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".ts") || name.endsWith(".tsx");
    }

    @Override
    public void analyze(Path root, Path path, SourceGraph graph) throws Exception {
        String relative = root.relativize(path).toString().replace('\\', '/');
        String fileId = GraphSupport.fileId(relative);
        String content = Files.readString(path);
        addMatches(graph, fileId, relative, content, IMPORT, "JS_MODULE_REFERENCE", "IMPORTS");
        addEndpointMatches(graph, fileId, relative, content);
        addMatches(graph, fileId, relative, content, SELECTOR, "DOM_SELECTOR", "SELECTS_ELEMENT");

        Matcher functions = FUNCTION.matcher(content);
        while (functions.find()) {
            String name = functions.group(1) != null ? functions.group(1) : functions.group(2);
            String id = "js-function:" + relative + "#" + name;
            graph.addNode(GraphSupport.node(id, "JS_FUNCTION", name, relative, lineOf(content, functions.start())));
            graph.addEdge(GraphSupport.edge(fileId, id, "DECLARES", "INFERRED", name));
        }
    }

    private void addEndpointMatches(SourceGraph graph, String source, String path, String content) {
        Matcher matcher = FETCH.matcher(content);
        while (matcher.find()) {
            String value = matcher.group(2);
            String normalized = normalizeEndpoint(value);
            String target = "rest-endpoint:" + normalized;
            graph.addNode(GraphSupport.node(target, "REST_ENDPOINT", normalized, path, lineOf(content, matcher.start()),
                    java.util.Map.of("path", normalized, "origin", "frontend")));
            graph.addEdge(GraphSupport.edge(source, target, "CALLS_ENDPOINT", "INFERRED", value));
        }
    }

    private String normalizeEndpoint(String value) {
        String normalized = value == null || value.isBlank() ? "/" : value.trim();
        int query = normalized.indexOf('?');
        if (query >= 0) normalized = normalized.substring(0, query);
        normalized = normalized.replaceAll("\\$\\{[^}]+}", "{value}");
        if (!normalized.startsWith("/")) normalized = "/" + normalized;
        return normalized.replaceAll("/+", "/");
    }

    private void addMatches(SourceGraph graph, String source, String path, String content, Pattern pattern, String nodeType, String edgeType) {
        Matcher matcher = pattern.matcher(content);
        while (matcher.find()) {
            String value = matcher.group(2);
            String target = nodeType.toLowerCase() + ":" + value;
            graph.addNode(GraphSupport.node(target, nodeType, value, path, lineOf(content, matcher.start())));
            graph.addEdge(GraphSupport.edge(source, target, edgeType, "INFERRED", value));
        }
    }

    private int lineOf(String content, int index) {
        int line = 1;
        for (int i = 0; i < index; i++) if (content.charAt(i) == '\n') line++;
        return line;
    }
}
