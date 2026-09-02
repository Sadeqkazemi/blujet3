import { describe, expect, it } from "vitest";
import { persianIntegerWords, tomanInputWords } from "./persian-number-words";

describe("Persian number words", () => {
  it("updates the spoken amount as digits are appended", () => {
    expect(tomanInputWords("۵۰")).toBe("پنجاه تومان");
    expect(tomanInputWords("۵۰۰")).toBe("پانصد تومان");
  });

  it("supports grouped large values without floating-point conversion", () => {
    expect(persianIntegerWords("۱٬۲۵۰٬۰۰۰")).toBe(
      "یک میلیون و دویست و پنجاه هزار",
    );
  });
});
