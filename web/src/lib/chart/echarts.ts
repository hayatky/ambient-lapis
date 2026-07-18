// Tree-shaken ECharts runtime. Imported only from the lazily loaded
// chart client component so the chart bundle stays out of the main page.
import { CustomChart, LineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  CustomChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export { echarts };
