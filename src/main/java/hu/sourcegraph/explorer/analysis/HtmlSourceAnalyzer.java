package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.SourceGraph;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.nio.file.Path;

@Component
@Order(30)
public class HtmlSourceAnalyzer implements SourceFileAnalyzer {
    @Override
    public boolean supports(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        return name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".jsp") || name.endsWith(".ftl");
    }

    @Override
    public void analyze(Path root, Path path, SourceGraph graph) throws Exception {
        String relative = root.relativize(path).toString().replace('\\', '/');
        String fileId = GraphSupport.fileId(relative);
        Document document = Jsoup.parse(path.toFile(), "UTF-8");

        for (Element script : document.select("script[src]")) addResource(graph, fileId, relative, script.attr("src"), "LOADS_SCRIPT");
        for (Element link : document.select("link[href]")) addResource(graph, fileId, relative, link.attr("href"), "LOADS_STYLESHEET");
        for (Element form : document.select("form[action]")) addNode(graph, fileId, relative, form.attr("action"), "REST_ENDPOINT", "SUBMITS_TO");

        for (Element element : document.getAllElements()) {
            if (!element.id().isBlank()) addNode(graph, fileId, relative, "#" + element.id(), "DOM_SELECTOR", "DECLARES_ELEMENT");
            for (String cssClass : element.classNames()) addNode(graph, fileId, relative, "." + cssClass, "CSS_SELECTOR", "USES_SELECTOR");
        }
    }

    private void addResource(SourceGraph graph, String source, String path, String value, String edgeType) {
        String target = "resource:" + value;
        graph.addNode(GraphSupport.node(target, "RESOURCE_REFERENCE", value, path, null));
        graph.addEdge(GraphSupport.edge(source, target, edgeType, "EXACT", value));
    }

    private void addNode(SourceGraph graph, String source, String path, String value, String type, String edgeType) {
        String target = type.toLowerCase() + ":" + value;
        graph.addNode(GraphSupport.node(target, type, value, path, null));
        graph.addEdge(GraphSupport.edge(source, target, edgeType, "EXACT", value));
    }
}
