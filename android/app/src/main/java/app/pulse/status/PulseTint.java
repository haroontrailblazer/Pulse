package app.pulse.status;

/**
 * Widget colour policy. Deliberately free of android.* types so the mapping and
 * the contrast lift stay covered by plain JVM unit tests.
 */
final class PulseTint {
    /** Widget surface, matching both widget_background.xml variants. */
    static final int SURFACE = 0xFF161616;
    static final int OPERATIONAL = 0xFF93D3AD;
    static final int DEGRADED = 0xFFEBC06C;
    static final int OUTAGE = 0xFFFF8989;
    static final int UNKNOWN = 0xFFA3A3A3;
    static final int FOREGROUND = 0xFFFAFAFA;
    /** WCAG contrast floor for a brand mark against the widget surface. */
    static final double MIN_CONTRAST = 3.0;
    /** Saturation below which a dark mark is treated as a white-on-dark logo. */
    static final double ACHROMATIC = 0.35;
    private static final int LIFT_STEPS = 20;

    private PulseTint() {}

    /**
     * Status colour shared by both widgets, so a service reads the same in each.
     * Severity ranks come from FeedReading.severity: 0 clear, 1 unavailable,
     * 2-3 issue, 4 outage.
     */
    static int status(int severity) {
        if (severity >= 4) return OUTAGE;
        if (severity >= 2) return DEGRADED;
        if (severity == 1) return UNKNOWN;
        return OPERATIONAL;
    }

    /** Icon tint: the provider's own brand colour while healthy, status colour otherwise. */
    static int icon(int severity, int brand) {
        if (severity >= 4) return OUTAGE;
        if (severity >= 2) return DEGRADED;
        if (severity == 1) return UNKNOWN;
        return readable(brand);
    }

    static int readable(int color) { return readable(color, SURFACE, MIN_CONTRAST); }

    /**
     * Seven brand colours are near-black - Vercel, GitHub, OpenAI, Notion,
     * CircleCI, HackerOne and Replicate - and disappear on the dark widget
     * surface. Their owners draw those marks white on dark, and blending a grey
     * toward white only reaches a muddy grey that reads the same for all seven,
     * so an achromatic mark becomes the widget ink instead. A dark mark that
     * still carries hue keeps it and is lifted until it clears the floor.
     */
    static int readable(int color, int background, double minContrast) {
        int opaque = 0xFF000000 | color;
        if (contrast(opaque, background) >= minContrast) return opaque;
        if (saturation(opaque) < ACHROMATIC && contrast(FOREGROUND, background) >= minContrast)
            return FOREGROUND;
        for (int step = 1; step <= LIFT_STEPS; step++) {
            int lifted = blend(opaque, 0xFFFFFFFF, (double) step / LIFT_STEPS);
            if (contrast(lifted, background) >= minContrast) return lifted;
        }
        return 0xFFFFFFFF;
    }

    /** HSV saturation. Every near-black brand sits below 0.24, every other above 0.49. */
    static double saturation(int color) {
        int r = red(color), g = green(color), b = blue(color);
        int max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b));
        return max == 0 ? 0 : (double) (max - min) / max;
    }

    static int blend(int from, int to, double amount) {
        return 0xFF000000
            | (channel(red(from), red(to), amount) << 16)
            | (channel(green(from), green(to), amount) << 8)
            | channel(blue(from), blue(to), amount);
    }

    static double contrast(int a, int b) {
        double first = luminance(a), second = luminance(b);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }

    static double luminance(int color) {
        return 0.2126 * linear(red(color)) + 0.7152 * linear(green(color)) + 0.0722 * linear(blue(color));
    }

    /** Parses the "#rrggbb" values carried by the generated native catalog. */
    static int parse(String value, int fallback) {
        if (value == null) return fallback;
        String digits = value.startsWith("#") ? value.substring(1) : value;
        if (digits.length() != 6 && digits.length() != 8) return fallback;
        try { return 0xFF000000 | (int) (Long.parseLong(digits, 16) & 0xFFFFFF); }
        catch (NumberFormatException error) { return fallback; }
    }

    private static int channel(int from, int to, double amount) {
        return (int) Math.round(from + (to - from) * Math.max(0, Math.min(1, amount)));
    }
    private static double linear(int value) {
        double channel = value / 255.0;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    }
    private static int red(int color) { return (color >> 16) & 0xFF; }
    private static int green(int color) { return (color >> 8) & 0xFF; }
    private static int blue(int color) { return color & 0xFF; }
}
