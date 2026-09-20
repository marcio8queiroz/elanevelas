export function imageResponse(image) {
  if (!image?.url) return null;
  return Object.fromEntries(['id', 'url', 'alt', 'isMain', 'width', 'height', 'format', 'bytes']
    .filter((key) => image[key] !== undefined).map((key) => [key, image[key]]));
}

export function catalogImageTransform(doc, result) {
  delete result.imageRevision;
  if (result.images) result.images = result.images.map(imageResponse);
  if (result.image) result.image = imageResponse(result.image);
  return result;
}
