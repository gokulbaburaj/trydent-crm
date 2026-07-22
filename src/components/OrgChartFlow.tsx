"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Building2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { Profile, UserRole } from "@/lib/types";

const roleTone: Record<UserRole, "green" | "blue" | "gray"> = {
  admin: "green",
  rep: "blue",
  client: "gray",
  contractor: "gray",
};

const NODE_W = 230;
const NODE_H = 76;
const X_GAP = 36;
const Y_GAP = 96;

interface PersonData extends Record<string, unknown> {
  name: string;
  role: UserRole;
  team: string | null;
  reports: number;
  isMe: boolean;
}

/** Card rendered for each person on the canvas. */
function PersonNode(props: NodeProps) {
  const data = props.data as PersonData;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border bg-surface px-3 py-2.5 shadow-lg shadow-black/30 transition-colors",
        data.isMe ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
      )}
      style={{ width: NODE_W }}
    >
      {/* Connection points — top receives from the manager, bottom feeds reports. */}
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-white/30" />
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
        {initials(data.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-foreground">{data.name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <Badge tone={roleTone[data.role]}>{data.role}</Badge>
          {data.team && (
            <span className="inline-flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
              <Building2 className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{data.team}</span>
            </span>
          )}
        </div>
      </div>
      {data.reports > 0 && (
        <span className="shrink-0 rounded-full bg-white/5 px-1.5 text-[10px] tabular-nums text-muted-foreground">
          {data.reports}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-white/30" />
    </div>
  );
}

const nodeTypes = { person: PersonNode };

/**
 * Tidy tree layout: children are placed left-to-right, each parent centred
 * over its children. Returns absolute positions keyed by profile id.
 */
function layout(staff: Profile[]) {
  const byManager = new Map<string, Profile[]>();
  for (const p of staff) {
    if (!p.reports_to) continue;
    const arr = byManager.get(p.reports_to) ?? [];
    arr.push(p);
    byManager.set(p.reports_to, arr);
  }
  for (const arr of byManager.values()) arr.sort((a, b) => a.full_name.localeCompare(b.full_name));

  const ids = new Set(staff.map((p) => p.id));
  const roots = staff
    .filter((p) => !p.reports_to || !ids.has(p.reports_to))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const pos = new Map<string, { x: number; y: number }>();
  const seen = new Set<string>();
  let cursor = 0;

  const place = (person: Profile, depth: number): number => {
    if (seen.has(person.id)) return cursor * (NODE_W + X_GAP); // cycle guard
    seen.add(person.id);

    const kids = byManager.get(person.id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = cursor * (NODE_W + X_GAP);
      cursor += 1;
    } else {
      const xs = kids.map((k) => place(k, depth + 1));
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    pos.set(person.id, { x, y: depth * (NODE_H + Y_GAP) });
    return x;
  };

  for (const r of roots) place(r, 0);

  // Anyone caught in a reporting cycle still gets a slot.
  for (const p of staff) {
    if (!pos.has(p.id)) {
      pos.set(p.id, { x: cursor * (NODE_W + X_GAP), y: 0 });
      cursor += 1;
    }
  }

  return { pos, byManager };
}

export function OrgChartFlow({
  staff,
  teams,
  meId,
  canManage,
  onRenameTeam,
  onDeleteTeam,
}: {
  staff: Profile[];
  teams: string[];
  meId?: string | null;
  canManage: boolean;
  onRenameTeam: (name: string) => void;
  onDeleteTeam: (name: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const { pos, byManager } = layout(staff);
    const ids = new Set(staff.map((p) => p.id));

    const nodes: Node[] = staff.map((p) => ({
      id: p.id,
      type: "person",
      position: pos.get(p.id) ?? { x: 0, y: 0 },
      data: {
        name: p.full_name,
        role: p.role,
        team: p.team,
        reports: (byManager.get(p.id) ?? []).length,
        isMe: p.id === meId,
      } satisfies PersonData,
    }));

    const edges: Edge[] = staff
      .filter((p) => p.reports_to && ids.has(p.reports_to))
      .map((p) => ({
        id: `${p.reports_to}-${p.id}`,
        source: p.reports_to as string,
        target: p.id,
        type: "smoothstep",
        animated: true,
        style: { stroke: "rgba(255,255,255,0.22)", strokeWidth: 1.5 },
      }));

    return { nodes, edges };
  }, [staff, meId]);

  return (
    <div className="flex flex-col gap-4">
      {/* Teams */}
      <div className="flex flex-wrap items-center gap-2">
        {teams.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No teams yet — create one with the New team button.
          </span>
        ) : (
          teams.map((t) => (
            <span
              key={t}
              className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-2 text-xs font-medium text-foreground-secondary"
            >
              <Building2 className="h-3 w-3 text-muted-foreground" />
              {t}
              <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                {staff.filter((p) => p.team === t).length}
              </span>
              {canManage && (
                <>
                  <button
                    onClick={() => onRenameTeam(t)}
                    title="Rename team"
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onDeleteTeam(t)}
                    title="Delete team"
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </span>
          ))
        )}
      </div>

      {/* Canvas */}
      <div className="h-[620px] overflow-hidden rounded-xl border border-border bg-panel">
        {staff.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No team members yet.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.2}
            maxZoom={1.75}
            proOptions={{ hideAttribution: true }}
            className="[&_.react-flow\\_\\_edge-path]:!stroke-[1.5]"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.10)" />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(0,0,0,0.6)"
              nodeColor="rgba(255,255,255,0.25)"
              className="!rounded-lg !border !border-border !bg-surface"
            />
            <Controls showInteractive={false} className="!rounded-lg !border !border-border !bg-surface" />
          </ReactFlow>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Drag people to rearrange, scroll to zoom, drag the canvas to pan. Layout is for viewing —
        reporting lines are set on the Members tab.
      </p>
    </div>
  );
}
