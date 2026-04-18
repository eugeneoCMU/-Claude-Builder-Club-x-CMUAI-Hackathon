"use client";

import { useEffect, useState } from "react";
import type { Connection, Tile as TileType } from "@/lib/types";

interface Props {
  tile: TileType;
  connections: Connection[];
  tilesById: Map<string, TileType>;
  onClose: () => void;
  onJumpTo: (id: string) => void;
}

export default function StoryModal({
  tile,
  connections,
  tilesById,
  onClose,
  onJumpTo,
}: Props) {
  const [councilOpen, setCouncilOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset the expandable when the selected tile changes.
  useEffect(() => {
    setCouncilOpen(false);
  }, [tile.id]);

  const primaryConnection = connections[0];
  const otherId =
    primaryConnection &&
    (primaryConnection.tileA === tile.id
      ? primaryConnection.tileB
      : primaryConnection.tileA);
  const otherTile = otherId ? tilesById.get(otherId) : null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 9, 8, 0.82)",
          backdropFilter: "blur(6px)",
          zIndex: 20,
          animation: "fadeIn 300ms ease",
        }}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(640px, 92vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "clamp(1.5rem, 4vw, 2.75rem)",
          background: "linear-gradient(180deg, #14110d 0%, #0d0b09 100%)",
          color: "var(--ink)",
          zIndex: 21,
          borderRadius: 6,
          border: "1px solid rgba(212, 175, 55, 0.22)",
          boxShadow:
            "0 1px 0 rgba(244, 229, 161, 0.08) inset, 0 20px 80px rgba(0, 0, 0, 0.7)",
          animation: "modalIn 380ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "transparent",
            border: "none",
            color: "var(--ink-muted)",
            fontSize: 18,
            cursor: "pointer",
            padding: 8,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <p
          id="story-title"
          className="serif"
          style={{
            fontStyle: "italic",
            fontSize: "clamp(1.5rem, 3.2vw, 2.1rem)",
            lineHeight: 1.25,
            color: "var(--gold-bright)",
            marginBottom: "1.75rem",
            textAlign: "center",
          }}
        >
          {tile.poeticLine}
        </p>

        <div
          className="serif"
          style={{
            fontSize: "1.02rem",
            lineHeight: 1.75,
            color: "var(--ink)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <p>
            <Label>regret</Label>
            {tile.regret}
          </p>
          <p>
            <Label>proudest</Label>
            {tile.proud}
          </p>
          <p>
            <Label>unfinished</Label>
            {tile.dream}
          </p>
        </div>

        {otherTile && primaryConnection && (
          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid rgba(212, 175, 55, 0.16)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "0.72rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--ink-muted)",
                marginBottom: "0.75rem",
              }}
            >
              a gold thread to another
            </p>
            <p
              className="serif"
              style={{
                fontStyle: "italic",
                fontSize: "1.25rem",
                lineHeight: 1.4,
                color: "var(--gold-bright)",
                marginBottom: "0.6rem",
              }}
            >
              “{primaryConnection.line}”
            </p>
            <button
              type="button"
              onClick={() => onJumpTo(otherTile.id)}
              style={{
                background: "transparent",
                border: "1px solid rgba(212, 175, 55, 0.4)",
                color: "var(--gold)",
                padding: "0.55rem 1.2rem",
                fontSize: "0.82rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: 3,
                transition: "all 250ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "rgba(212, 175, 55, 0.08)";
                e.currentTarget.style.borderColor = "var(--gold-bright)";
                e.currentTarget.style.color = "var(--gold-bright)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(212, 175, 55, 0.4)";
                e.currentTarget.style.color = "var(--gold)";
              }}
            >
              follow the thread → {otherTile.poeticLine}
            </button>
          </div>
        )}

        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid rgba(212, 175, 55, 0.1)",
          }}
        >
          <button
            type="button"
            onClick={() => setCouncilOpen((v) => !v)}
            aria-expanded={councilOpen}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink-muted)",
              fontSize: "0.74rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              margin: "0 auto",
              transition: "color 200ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--gold-bright)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--ink-muted)";
            }}
          >
            <span>{councilOpen ? "hide" : "what the council said"}</span>
            <span
              style={{
                transform: councilOpen ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 250ms ease",
                display: "inline-block",
              }}
            >
              ⌄
            </span>
          </button>

          {councilOpen && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "1.25rem 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
                animation: "fadeIn 400ms ease",
              }}
            >
              <CouncilLine
                voice="the empath"
                text={tile.councilWhispers.empath}
              />
              <CouncilLine
                voice="the poet"
                text={tile.councilWhispers.poet}
              />
              <CouncilLine
                voice="the visual artist"
                text={tile.councilWhispers.artist}
              />
              <CouncilLine
                voice="the kintsugi philosopher"
                text={tile.councilWhispers.philosopher}
              />
              <CouncilLine
                voice="the curator"
                text={tile.councilWhispers.curator}
              />
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="serif"
      style={{
        display: "block",
        fontSize: "0.68rem",
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: "var(--gold)",
        marginBottom: "0.35rem",
        fontStyle: "normal",
        opacity: 0.75,
      }}
    >
      {children}
    </span>
  );
}

function CouncilLine({ voice, text }: { voice: string; text: string }) {
  return (
    <li
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
      }}
    >
      <span
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color: "var(--gold-deep)",
        }}
      >
        {voice}
      </span>
      <span
        className="serif"
        style={{
          fontStyle: "italic",
          fontSize: "1rem",
          lineHeight: 1.5,
          color: "var(--ink)",
        }}
      >
        {text}
      </span>
    </li>
  );
}
