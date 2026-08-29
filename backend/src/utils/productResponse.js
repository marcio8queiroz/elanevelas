const publicProductFields = 'name slug shortDescription fragrance price promotionalPrice stock images isActive';

export const publicProductSelect = publicProductFields;

export default function productResponse(product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    fragrance: product.fragrance,
    price: product.price,
    promotionalPrice: product.promotionalPrice,
    stock: product.stock,
    images: product.images,
  };
}
