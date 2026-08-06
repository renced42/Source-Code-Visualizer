package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.SourceGraph;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Order(40)
public class CssSourceAnalyzer implements SourceFileAnalyzer {
    private static final Pattern RULE = Pattern.compile("(?m)([^@{}][^{}]*)\\{");
    private static final Pattern IMPORT = Pattern.compile("@import\\s+(?:url\\()?['\\\"]?([^'\\\")]+)");

    @Override
    public boolean supports(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        return name.endsWith(".css") || name.endsWith(".scss") || name.endsWith(".sass");
    }

    @Override
    public void analyze(Path root, Path path, SourceGraph graph) throws Exception {
        String relative = root.relativize(path).toString().replace('\\', '/');
        String fileId = GraphSupport.fileId(relative);
        String content = Files.readString(path);

        Matcher imports = IMPORT.matcher(content);
        while (imports.find()) {
            String value = imports.group(1).trim();
            String target = "resource:" + value;
            graph.addNode(GraphSupport.node(target, "RESOURCE_REFERENCE", value, relative, null));
            graph.addEdge(GraphSupport.edge(fileId, target, "IMPORTS", "EXACT", value));
        }

        Matcher rules = RULE.matcher(content);
        while (rules.find()) {
            for (String raw : rules.group(1).split(",")) {
                String selector = raw.trim();
                if (selector.isBlank() || selector.contains(";") || selector.length() > 160) continue;
                String target = "css-selector:" + selector;
                graph.addNode(GraphSupport.node(target, "CSS_SELECTOR", selector, relative, lineOf(content, rules.start())));
                graph.addEdge(GraphSupport.edge(fileId, target, "DECLARES_SELECTOR", "INFERRED", selector));
            }
        }
    }

    private int lineOf(String content, int index) {
        int line = 1;
        for (int i = 0; i < index; i++) if (content.charAt(i) == '\n') line++;
        return line;
    }
}
