/**
 * Returns the cartesian product of the given arrays.
 * cartesianProduct([["a","b"], ["x","y"]]) → [["a","x"],["a","y"],["b","x"],["b","y"]]
 *
 * Single source of truth shared by productVariants.ts and MatrixConfigDrawer.tsx.
 */
export function cartesianProduct<T>(arrays: T[][]): T[][] {
    if (arrays.length === 0) return [[]];
    const [first, ...rest] = arrays;
    const restProduct = cartesianProduct(rest);
    const result: T[][] = [];
    for (const item of first) {
        for (const restItems of restProduct) {
            result.push([item, ...restItems]);
        }
    }
    return result;
}
