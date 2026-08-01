import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("main player flow", () => {
  beforeEach(() => localStorage.clear());

  it("creates a character and enters the first playable turn", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "择一命格，踏入此界" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("道友名讳"), { target: { value: "顾见微" } });
    fireEvent.click(screen.getByRole("button", { name: /坠入异界/ }));
    expect(screen.getAllByText("顾见微").length).toBeGreaterThan(0);
    expect(screen.getByText("行旅录")).toBeInTheDocument();
    expect(document.querySelector(".center-panel.active .actions-section")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "异界舆图" }));
    expect(screen.getByRole("heading", { name: "异界舆图" })).toBeInTheDocument();
    const npcCard = document.querySelector(".npc-card");
    expect(npcCard).toBeInTheDocument();
    fireEvent.click(npcCard!);
    expect(document.querySelector(".npc-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /促膝闲谈/ }));
    expect(document.querySelector(".npc-dialog")).not.toBeInTheDocument();
    fireEvent.contextMenu(document.querySelector(".map-node.current")!);
    expect(screen.getByRole("dialog", { name: /今日行止/ })).toBeInTheDocument();
    expect(screen.getByText("自身固有行动")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /闭关吐纳/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /闭关吐纳/ }));
    fireEvent.click(screen.getByRole("button", { name: /开始行动/ }));
    fireEvent.click(document.querySelector(".view-tabs button")!);
    expect(screen.getByText(/修为增长/)).toBeInTheDocument();
    expect(screen.getByText("每次轮回皆有不同", { exact: false })).toBeInTheDocument();
  });
});
