package app.pulse.status;
import org.junit.Test;
import static org.junit.Assert.*;
public class PulseIconGridTest {
    @Test public void aBiggerBoxDrawsBiggerMarks() {
        // A 4x1 cell on a 4x5 launcher grid versus the same widget on a taller
        // 5x6 grid: the second has room to grow and must use it.
        int small=PulseIconGrid.cell(300,70,12);
        int tall=PulseIconGrid.cell(330,130,12);
        assertTrue("a taller box must not shrink the marks",tall>=small);
        assertTrue("a 130dp tall box should clear the smallest cell",tall>PulseIconGrid.CELLS[0]);
    }
    @Test public void everyWatchedServiceFitsWithoutScrollingWhenItCan() {
        for(int width:new int[]{180,250,300,330,411,520})
            for(int height:new int[]{58,110,130,180,260,400})
                for(int count:new int[]{1,4,12,28}) {
                    int cell=PulseIconGrid.cell(width,height,count);
                    int columns=PulseIconGrid.columns(width,cell);
                    int rows=PulseIconGrid.rows(count,columns);
                    boolean fits=rows*cell<=height-2*PulseIconGrid.PADDING;
                    boolean smallest=cell==PulseIconGrid.CELLS[0];
                    assertTrue("chose "+cell+"dp for "+width+"x"+height+" n="+count,fits||smallest);
                }
    }
    @Test public void growingTheWidgetNeverShrinksTheMarks() {
        for(int count:new int[]{4,12,28}) {
            int previous=0;
            for(int height=58;height<=500;height+=2) {
                int cell=PulseIconGrid.cell(330,height,count);
                assertTrue("height "+height+" shrank the cell",cell>=previous);
                previous=cell;
            }
        }
    }
    @Test public void columnsNeverCollapseToZeroOrOverflow() {
        assertEquals(1,PulseIconGrid.columns(0,40));
        assertEquals(1,PulseIconGrid.columns(40,40));
        // A non-positive cell falls back to the smallest real one.
        assertEquals(PulseIconGrid.columns(330,PulseIconGrid.CELLS[0]),PulseIconGrid.columns(330,0));
        assertTrue(PulseIconGrid.columns(411,40)>=9);
        for(int width=60;width<=600;width+=7)
            for(int cell:PulseIconGrid.CELLS)
                assertTrue(PulseIconGrid.columns(width,cell)*cell<=Math.max(cell,width-2*PulseIconGrid.PADDING));
    }
    @Test public void rowCountsCoverEveryService() {
        assertEquals(0,PulseIconGrid.rows(0,5));
        assertEquals(1,PulseIconGrid.rows(1,5));
        assertEquals(1,PulseIconGrid.rows(5,5));
        assertEquals(2,PulseIconGrid.rows(6,5));
        assertEquals(3,PulseIconGrid.rows(12,5));
        assertEquals(28,PulseIconGrid.rows(28,1));
        // A nonsensical column count still has to account for every service.
        assertEquals(3,PulseIconGrid.rows(3,0));
        assertEquals(3,PulseIconGrid.rows(3,-5));
    }
    @Test public void everyCellSizeHasACellLayout() {
        assertEquals(PulseIconGrid.CELLS.length,PulseIconService.LAYOUTS.length);
        for(int width:new int[]{110,411,520})
            for(int height:new int[]{58,260})
                assertTrue(PulseIconGrid.fit(width,height,12)<PulseIconService.LAYOUTS.length);
    }
}
