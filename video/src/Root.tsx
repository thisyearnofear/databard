import { Composition } from "remotion";
import { DataGarden, dataGardenSchema, FPS } from "./DataGarden";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DataGarden"
      component={DataGarden}
      schema={dataGardenSchema}
      durationInFrames={FPS * 88}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        // Real verified values from the Sep 8, 2026 live runs (docs/MONID_HACKATHON.md)
        healthScore: 95,
        rowCount: 43,
        costUsd: 0.006,
        runId: "01M20SCQV43Y9KDJXWEYS01FY8",
        seatPriceUsdLow: 349,
        seatPriceUsdHigh: 390,
      }}
    />
  );
};
