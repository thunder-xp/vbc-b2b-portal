import { describe, expect, it } from "vitest";

import { generateMetadata as calculatorMetadata } from "../../../../app/calculator/cctv/page";
import { generateMetadata as resultMetadata } from "../../../../app/calculator/cctv/result/page";

describe("public CCTV calculator metadata", () => {
  it("uses authored Romanian metadata when requested", async () => {
    await expect(calculatorMetadata({ searchParams: Promise.resolve({ lang: "ro" }) })).resolves.toMatchObject({
      title: "Calcul sistem de supraveghere video | Novotech",
    });
    await expect(resultMetadata({ searchParams: Promise.resolve({ lang: "ro" }) })).resolves.toMatchObject({
      title: "Calcul preliminar CCTV | Novotech",
    });
  });

  it("keeps Russian metadata as the safe default", async () => {
    await expect(calculatorMetadata({ searchParams: Promise.resolve({}) })).resolves.toMatchObject({
      title: "Расчёт системы видеонаблюдения | Novotech",
    });
    await expect(resultMetadata({ searchParams: Promise.resolve({ lang: "unsupported" }) })).resolves.toMatchObject({
      title: "Предварительный расчёт CCTV | Novotech",
    });
  });
});
