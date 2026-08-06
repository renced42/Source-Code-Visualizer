package hu.sourcegraph.explorer.analysis;

import hu.sourcegraph.explorer.model.SourceGraph;

import java.nio.file.Path;

public interface SourceFileAnalyzer {
    boolean supports(Path path);
    void analyze(Path root, Path path, SourceGraph graph) throws Exception;
}
