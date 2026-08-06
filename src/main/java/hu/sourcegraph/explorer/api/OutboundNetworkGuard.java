package hu.sourcegraph.explorer.api;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.net.InetAddress;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Blocks JVM-level HTTP/HTTPS URI connections to non-local addresses.
 *
 * <p>The application does not need outbound networking during analysis. This guard is a
 * defense-in-depth measure: local application calls remain available, while attempts to access
 * external hosts through standard JVM HTTP clients fail immediately.</p>
 */
@Configuration
public class OutboundNetworkGuard {

    private final boolean outboundNetworkEnabled;

    public OutboundNetworkGuard(
            @Value("${app.security.outbound-network-enabled:false}") boolean outboundNetworkEnabled) {
        this.outboundNetworkEnabled = outboundNetworkEnabled;
    }

    @PostConstruct
    void install() {
        if (outboundNetworkEnabled) {
            return;
        }

        ProxySelector.setDefault(new ProxySelector() {
            @Override
            public List<Proxy> select(URI uri) {
                if (uri == null || isLocal(uri)) {
                    return List.of(Proxy.NO_PROXY);
                }
                throw new SecurityException(
                        "Outbound network access is disabled: " + safeDescription(uri));
            }

            @Override
            public void connectFailed(URI uri, SocketAddress socketAddress, IOException exception) {
                // No retry or fallback proxy is allowed.
            }
        });
    }

    private static boolean isLocal(URI uri) {
        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            return true;
        }

        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            return true;
        }
        if ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host)) {
            return true;
        }

        try {
            InetAddress address = InetAddress.getByName(host);
            return address.isLoopbackAddress() || address.isAnyLocalAddress();
        } catch (IOException ignored) {
            return false;
        }
    }

    private static String safeDescription(URI uri) {
        String scheme = uri.getScheme() == null ? "unknown" : uri.getScheme();
        String host = uri.getHost() == null ? "unknown" : uri.getHost();
        return scheme + "://" + host;
    }
}
