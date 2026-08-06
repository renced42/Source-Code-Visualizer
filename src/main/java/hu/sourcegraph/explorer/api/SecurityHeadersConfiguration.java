package hu.sourcegraph.explorer.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class SecurityHeadersConfiguration {

    @Bean
    OncePerRequestFilter localOnlyBrowserPolicyFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(
                    HttpServletRequest request,
                    HttpServletResponse response,
                    FilterChain filterChain) throws ServletException, IOException {
                response.setHeader("Content-Security-Policy",
                        "default-src 'self'; "
                                + "script-src 'self'; "
                                + "style-src 'self' 'unsafe-inline'; "
                                + "img-src 'self' data:; "
                                + "font-src 'self'; "
                                + "connect-src 'self'; "
                                + "object-src 'none'; "
                                + "frame-src 'none'; "
                                + "worker-src 'none'; "
                                + "base-uri 'self'; "
                                + "form-action 'self'; "
                                + "frame-ancestors 'none'");
                response.setHeader("Referrer-Policy", "no-referrer");
                response.setHeader("X-Content-Type-Options", "nosniff");
                response.setHeader("X-Frame-Options", "DENY");
                response.setHeader("Permissions-Policy",
                        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()");
                filterChain.doFilter(request, response);
            }
        };
    }
}
