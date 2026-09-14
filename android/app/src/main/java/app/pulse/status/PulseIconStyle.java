package app.pulse.status;

/**
 * Per-instance background choice for the icon widget. Free of android.* types so
 * the key scheme and the fallbacks stay covered by plain JVM unit tests.
 */
final class PulseIconStyle {
    /** Icons float directly on the wallpaper. The default. */
    static final String TRANSPARENT = "transparent";
    /** The same dark card the stack widget uses. */
    static final String CARD = "card";
    private static final String PREFIX = "iconBackground.";

    private PulseIconStyle() {}

    static String key(int widgetId) { return PREFIX + widgetId; }
    static boolean owns(String key) { return key != null && key.startsWith(PREFIX); }

    /**
     * Anything unrecognised - absent, empty, or a value written by a newer
     * build - falls back to transparent rather than leaving the widget unpainted.
     */
    static String normalize(String stored) { return CARD.equals(stored) ? CARD : TRANSPARENT; }

    static boolean solid(String stored) { return CARD.equals(normalize(stored)); }

    /** The other choice, for a config screen that toggles rather than lists. */
    static String other(String stored) { return solid(stored) ? TRANSPARENT : CARD; }
}
