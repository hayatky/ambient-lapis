import type { EChartsType } from "echarts/core";

export interface EChartsRuntime {
  init(element: HTMLElement): EChartsType;
}

export async function loadECharts(): Promise<EChartsRuntime> {
  const [core, charts, components, renderers] = await Promise.all([
    import("echarts/core"),
    import("echarts/charts"),
    import("echarts/components"),
    import("echarts/renderers"),
  ]);

  core.use([
    charts.LineChart,
    components.GridComponent,
    components.TooltipComponent,
    components.DataZoomComponent,
    components.MarkAreaComponent,
    renderers.CanvasRenderer,
  ]);

  return {
    init: (element) =>
      core.init(element, undefined, {
        renderer: "canvas",
      }),
  };
}
