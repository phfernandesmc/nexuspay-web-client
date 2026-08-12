import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "@/App";

describe("App", () => {
  it("monta e renderiza a marca", () => {
    render(<App />);
    expect(screen.getByText("NexusPay")).toBeInTheDocument();
  });
});
