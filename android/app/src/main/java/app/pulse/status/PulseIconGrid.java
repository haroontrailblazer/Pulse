package app.pulse.status;

/**
 * Picks how large the brand marks are drawn and how many fit per row.
 *
 * A launcher cell is not a fixed size - a 5x6 grid gives a much taller, wider
 * box than a 4x5 one - so a single icon size either looks lost in the space or
 * overflows it. This chooses the largest size that still fits every watched
 * service without scrolling. Free of android.* types so the arithmetic stays
 * covered by plain JVM unit tests.
 */
final class PulseIconGrid {
    /** Cell edge in dp, smallest first. Each entry has a matching cell layout. */
    static final int[] CELLS = { 40, 52, 64, 76 };
    /** Padding inside the widget, per side, matching pulse_icon_widget.xml. */
    static final int PADDING = 8;

    private PulseIconGrid() {}

    static int columns(int widthDp, int cellDp) {
        int cell = cellDp > 0 ? cellDp : CELLS[0];
        return Math.max(1, (widthDp - 2 * PADDING) / cell);
    }

    static int rows(int count, int columns) {
        // Clamp before dividing: guarding only the divisor would round a
        // zero-column grid down to one row short.
        int perRow = Math.max(1, columns);
        return count <= 0 ? 0 : (count + perRow - 1) / perRow;
    }

    /**
     * Index into CELLS of the largest cell whose grid still fits the box.
     * Falls back to the smallest, letting the grid scroll, when nothing fits.
     */
    static int fit(int widthDp, int heightDp, int count) {
        int chosen = 0;
        for (int n = 0; n < CELLS.length; n++)
            if (rows(count, columns(widthDp, CELLS[n])) * CELLS[n] <= heightDp - 2 * PADDING) chosen = n;
        return chosen;
    }

    static int cell(int widthDp, int heightDp, int count) { return CELLS[fit(widthDp, heightDp, count)]; }

    static int columnsFor(int widthDp, int heightDp, int count) {
        return columns(widthDp, cell(widthDp, heightDp, count));
    }
}
