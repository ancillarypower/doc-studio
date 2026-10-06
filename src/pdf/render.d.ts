export function createRenderer(doc: any): {
    renderPage: (pageRef: any, targetH?: number) => Promise<HTMLCanvasElement>;
};
