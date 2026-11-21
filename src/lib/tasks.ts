import type { DesignVersion, Reference, Requirement, Room } from './types';
import { computeRoomShape } from './geometry/room';
import { spaceKind } from './labels';
import { isKnown } from './units';

export interface DerivedTask {
  id: string;
  roomId: string;
  roomName: string;
  title: string;
  to: string;
  weight: number;
}

/** Tasks derived from what's missing or awaiting a decision. Never auto-filled. */
export function deriveTasks(rooms: Room[], reqs: Requirement[], refs: Reference[], versions: DesignVersion[]): DerivedTask[] {
  const out: DerivedTask[] = [];
  for (const room of rooms) {
    const base = `/rooms/${room.id}`;
    const shape = computeRoomShape(room);
    const roomReqs = reqs.filter((r) => r.roomId === room.id);
    const photos = refs.filter((r) => r.kind === 'site-photo' && r.roomIds.includes(room.id));
    const roomVersions = versions.filter((v) => v.roomId === room.id);
    if (room.status === 'needs-revision')
      out.push({ id: `${room.id}-rev`, roomId: room.id, roomName: room.name, title: 'Revise the design', to: `/studio/${room.id}`, weight: 0 });
    const review = roomVersions.filter((v) => v.status === 'under-review' || v.status === 'draft').length;
    if (review)
      out.push({
        id: `${room.id}-review`,
        roomId: room.id,
        roomName: room.name,
        title: `Review ${review} concept${review > 1 ? 's' : ''}`,
        to: `${base}/versions`,
        weight: 1,
      });
    const needsReview = roomReqs.filter((r) => r.status === 'needs-review').length;
    if (needsReview)
      out.push({
        id: `${room.id}-req-review`,
        roomId: room.id,
        roomName: room.name,
        title: `Review ${needsReview} requirement${needsReview > 1 ? 's' : ''}`,
        to: `${base}/requirements`,
        weight: 2,
      });
    if (!shape.drawable)
      out.push({ id: `${room.id}-dims`, roomId: room.id, roomName: room.name, title: 'Add dimensions', to: `${base}/dimensions`, weight: 3 });
    else if (spaceKind(room.type) === 'interior' && !isKnown(room.ceilingHeight))
      out.push({ id: `${room.id}-ceil`, roomId: room.id, roomName: room.name, title: 'Add ceiling height', to: `${base}/dimensions`, weight: 5 });
    if (!photos.length)
      out.push({ id: `${room.id}-photos`, roomId: room.id, roomName: room.name, title: 'Upload site photos', to: `${base}/photos`, weight: 4 });
    if (!roomReqs.length)
      out.push({ id: `${room.id}-reqs`, roomId: room.id, roomName: room.name, title: 'Write requirements', to: `${base}/requirements`, weight: 4 });
    const unknownEls = room.elements.filter((e) => e.status !== 'confirmed').length;
    if (unknownEls)
      out.push({
        id: `${room.id}-els`,
        roomId: room.id,
        roomName: room.name,
        title: `Confirm ${unknownEls} architectural element${unknownEls > 1 ? 's' : ''}`,
        to: `${base}/architecture`,
        weight: 6,
      });
  }
  return out.sort((a, b) => a.weight - b.weight);
}
