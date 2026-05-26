const OBJECT_PATH_PREFIX = "/objects/";

function cleanPathSegment(value: string): string {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function isSafeObjectSegment(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith(".") &&
    !value.includes("../") &&
    !value.includes("/..") &&
    !value.split("/").includes(".")
  );
}

export function entityIdToObjectPath(entityId: string): string {
  const cleanEntityId = cleanPathSegment(entityId);
  if (!isSafeObjectSegment(cleanEntityId)) {
    throw new Error("Invalid object entity id");
  }
  return `${OBJECT_PATH_PREFIX}${cleanEntityId}`;
}

export function objectPathToEntityId(objectPath: string): string | null {
  if (!objectPath.startsWith(OBJECT_PATH_PREFIX)) {
    return null;
  }

  const entityId = cleanPathSegment(
    objectPath.slice(OBJECT_PATH_PREFIX.length),
  );
  if (!isSafeObjectSegment(entityId)) {
    return null;
  }
  return entityId;
}

export function joinObjectKey(prefix: string, entityId: string): string {
  const cleanPrefix = cleanPathSegment(prefix);
  const cleanEntityId = cleanPathSegment(entityId);
  if (!isSafeObjectSegment(cleanEntityId)) {
    throw new Error("Invalid object entity id");
  }
  return cleanPrefix ? `${cleanPrefix}/${cleanEntityId}` : cleanEntityId;
}
