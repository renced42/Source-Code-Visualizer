package hu.sourcegraph.explorer.util;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

public final class FileTreeCleaner {
    private FileTreeCleaner() {
    }

    public static void deleteRecursively(Path root) {
        if (root == null || !Files.exists(root)) {
            return;
        }
        try (var paths = Files.walk(root)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // Temporary analysis data is best-effort cleaned.
                }
            });
        } catch (IOException ignored) {
            // Temporary analysis data is best-effort cleaned.
        }
    }
}
