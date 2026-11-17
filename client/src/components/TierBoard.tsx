import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { POOL, moveItem, type Board } from "../utils/board";
import type { Item } from "../utils/types";

const tierId = (index: number) => `tier-${index}`;

// Prefer the small drop target (an item, to insert before it) over the big one (its tier)
const collisions: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const hits = within.length > 0 ? within : rectIntersection(args);
  const slots = hits.filter((hit) => String(hit.id).startsWith("slot:"));
  return slots.length > 0 ? slots : hits;
};

function Tile({
  item,
  container,
  editable,
  overlay = false,
}: {
  item: Item;
  container: string;
  editable: boolean;
  overlay?: boolean;
}) {
  const drag = useDraggable({ id: item._id, disabled: !editable || overlay });
  const drop = useDroppable({ id: `slot:${item._id}`, data: { container }, disabled: !editable || overlay });

  const classes = [
    "item-tile",
    item.imageUrl ? "with-image" : "",
    editable ? "draggable" : "",
    drag.isDragging ? "dragging" : "",
    overlay ? "overlay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={classes}
      title={item.name}
      {...(editable && !overlay ? { ...drag.listeners, ...drag.attributes } : {})}
    >
      {item.imageUrl && <img src={item.imageUrl} alt="" draggable={false} />}
      <span className="item-name">{item.name}</span>
    </div>
  );
}

function Container({
  id,
  className,
  children,
  editable,
}: {
  id: string;
  className: string;
  children: React.ReactNode;
  editable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { container: id }, disabled: !editable });
  return (
    <div ref={setNodeRef} className={`${className}${isOver ? " over" : ""}`} data-container={id}>
      {children}
    </div>
  );
}

interface TierBoardProps {
  items: Item[];
  board: Board;
  // Read-only boards (other people's rankings, the community ranking) leave these out
  onChange?: (board: Board) => void;
}

function TierBoard({ items, board, onChange }: TierBoardProps) {
  const editable = Boolean(onChange);
  const [activeId, setActiveId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !onChange) return;

    const itemId = String(active.id);
    const overId = String(over.id);

    if (overId.startsWith("slot:")) {
      const beforeId = overId.slice("slot:".length);
      if (beforeId === itemId) return;
      const container = String(over.data.current?.container ?? POOL);
      onChange(moveItem(board, itemId, container, beforeId));
    } else {
      onChange(moveItem(board, itemId, overId));
    }
  }

  function renameTier(index: number, label: string) {
    onChange?.({ ...board, tiers: board.tiers.map((tier, i) => (i === index ? { ...tier, label } : tier)) });
  }

  function recolorTier(index: number, color: string) {
    onChange?.({ ...board, tiers: board.tiers.map((tier, i) => (i === index ? { ...tier, color } : tier)) });
  }

  // Removing a tier sends its items back to the pool
  function removeTier(index: number) {
    if (board.tiers.length <= 1) return;
    const removed = board.tiers[index];
    onChange?.({
      tiers: board.tiers.filter((_, i) => i !== index),
      pool: [...board.pool, ...removed.itemIds],
    });
  }

  const activeItem = activeId ? byId.get(activeId) : undefined;

  const rows = board.tiers.map((tier, index) => {
    const id = tierId(index);
    return (
      <div className="tier-row" key={id}>
        <div className="tier-label" style={{ background: tier.color }}>
          {editable ? (
            <div>
              <input
                aria-label={`Name of tier ${index + 1}`}
                value={tier.label}
                maxLength={20}
                onChange={(e) => renameTier(index, e.target.value)}
              />
              <div className="tier-tools justify-content-center">
                <input
                  type="color"
                  aria-label={`Color of tier ${tier.label}`}
                  value={/^#[0-9a-f]{6}$/i.test(tier.color) ? tier.color : "#cccccc"}
                  onChange={(e) => recolorTier(index, e.target.value)}
                  style={{ width: 28, height: 22, padding: 0, border: 0, background: "none" }}
                />
                <button
                  type="button"
                  className="btn btn-sm p-0 px-1"
                  aria-label={`Remove tier ${tier.label}`}
                  onClick={() => removeTier(index)}
                  disabled={board.tiers.length <= 1}
                >
                  <i className="bi bi-x-lg" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          ) : (
            tier.label
          )}
        </div>
        <Container id={id} className="tier-items" editable={editable}>
          {tier.itemIds.map((itemId) => {
            const item = byId.get(itemId);
            return item ? <Tile key={itemId} item={item} container={id} editable={editable} /> : null;
          })}
        </Container>
      </div>
    );
  });

  const body = (
    <>
      <div className="board" role="group" aria-label="Tier list">
        {rows}
      </div>

      {(editable || board.pool.length > 0) && (
        <>
          <h3 className="h6 mt-4 mb-2">{editable ? "Not ranked yet" : "Unranked"}</h3>
          <Container id={POOL} className="pool" editable={editable}>
            {board.pool.length === 0 && editable && (
              <span className="muted small align-self-center px-2">Every item is placed.</span>
            )}
            {board.pool.map((itemId) => {
              const item = byId.get(itemId);
              return item ? <Tile key={itemId} item={item} container={POOL} editable={editable} /> : null;
            })}
          </Container>
        </>
      )}
    </>
  );

  if (!editable) return body;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {body}
      <DragOverlay>{activeItem ? <Tile item={activeItem} container={POOL} editable={false} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

export default TierBoard;
