/**
 * Face Morphing Algorithm
 * Uses Delaunay triangulation and affine transformations to morph between two faces
 */

class FaceMorpher {
    constructor() {
        this.outputWidth = 400;
        this.outputHeight = 400;
    }

    /**
     * Morph two faces together
     * @param {HTMLImageElement} img1 - First face image
     * @param {HTMLImageElement} img2 - Second face image
     * @param {Array} landmarks1 - 68 facial landmarks for face 1
     * @param {Array} landmarks2 - 68 facial landmarks for face 2
     * @param {number} ratio - Blend ratio (0-1), 0 = face1, 1 = face2
     * @returns {ImageData} - Morphed face image data
     */
    morph(img1, img2, landmarks1, landmarks2, ratio) {
        // Normalize landmarks to output dimensions
        const pts1 = this.normalizeLandmarks(landmarks1, img1.width, img1.height);
        const pts2 = this.normalizeLandmarks(landmarks2, img2.width, img2.height);

        // Add corner and edge points for complete coverage
        const extraPoints = this.getBoundaryPoints();
        const allPts1 = [...pts1, ...extraPoints];
        const allPts2 = [...pts2, ...extraPoints];

        // Compute intermediate points based on ratio
        const avgPts = this.interpolatePoints(allPts1, allPts2, ratio);

        // Compute Delaunay triangulation on average points
        const triangles = this.computeDelaunay(avgPts);

        // Create canvases for source images scaled to output size
        const canvas1 = this.imageToCanvas(img1);
        const canvas2 = this.imageToCanvas(img2);
        const ctx1 = canvas1.getContext('2d');
        const ctx2 = canvas2.getContext('2d');
        const imgData1 = ctx1.getImageData(0, 0, this.outputWidth, this.outputHeight);
        const imgData2 = ctx2.getImageData(0, 0, this.outputWidth, this.outputHeight);

        // Create output image
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = this.outputWidth;
        outputCanvas.height = this.outputHeight;
        const outputCtx = outputCanvas.getContext('2d');
        const outputData = outputCtx.createImageData(this.outputWidth, this.outputHeight);

        // Process each triangle
        for (const tri of triangles) {
            const [i, j, k] = tri;

            // Get triangle vertices for each image and the average
            const srcTri1 = [allPts1[i], allPts1[j], allPts1[k]];
            const srcTri2 = [allPts2[i], allPts2[j], allPts2[k]];
            const dstTri = [avgPts[i], avgPts[j], avgPts[k]];

            // Warp and blend this triangle
            this.warpTriangle(imgData1, srcTri1, imgData2, srcTri2, outputData, dstTri, ratio);
        }

        return outputData;
    }

    /**
     * Normalize landmarks to output dimensions
     */
    normalizeLandmarks(landmarks, imgWidth, imgHeight) {
        return landmarks.map(pt => ({
            x: (pt.x / imgWidth) * this.outputWidth,
            y: (pt.y / imgHeight) * this.outputHeight
        }));
    }

    /**
     * Get boundary points (corners and edges) for complete face coverage
     */
    getBoundaryPoints() {
        const w = this.outputWidth;
        const h = this.outputHeight;
        return [
            { x: 0, y: 0 },
            { x: w / 2, y: 0 },
            { x: w - 1, y: 0 },
            { x: w - 1, y: h / 2 },
            { x: w - 1, y: h - 1 },
            { x: w / 2, y: h - 1 },
            { x: 0, y: h - 1 },
            { x: 0, y: h / 2 }
        ];
    }

    /**
     * Interpolate between two sets of points
     */
    interpolatePoints(pts1, pts2, ratio) {
        return pts1.map((pt, i) => ({
            x: pt.x * (1 - ratio) + pts2[i].x * ratio,
            y: pt.y * (1 - ratio) + pts2[i].y * ratio
        }));
    }

    /**
     * Compute Delaunay triangulation using Bowyer-Watson algorithm
     */
    computeDelaunay(points) {
        const n = points.length;
        if (n < 3) return [];

        // Create super triangle that contains all points
        const minX = Math.min(...points.map(p => p.x));
        const maxX = Math.max(...points.map(p => p.x));
        const minY = Math.min(...points.map(p => p.y));
        const maxY = Math.max(...points.map(p => p.y));

        const dx = maxX - minX;
        const dy = maxY - minY;
        const deltaMax = Math.max(dx, dy) * 2;

        const p1 = { x: minX - deltaMax, y: minY - deltaMax };
        const p2 = { x: minX + deltaMax * 2, y: minY - deltaMax };
        const p3 = { x: minX + dx / 2, y: maxY + deltaMax * 2 };

        const allPoints = [...points, p1, p2, p3];
        let triangles = [{ i: n, j: n + 1, k: n + 2 }];

        // Add points one by one
        for (let i = 0; i < n; i++) {
            const pt = points[i];
            const badTriangles = [];
            const polygon = [];

            // Find triangles whose circumcircle contains the point
            for (const tri of triangles) {
                if (this.inCircumcircle(pt, allPoints[tri.i], allPoints[tri.j], allPoints[tri.k])) {
                    badTriangles.push(tri);
                }
            }

            // Find boundary polygon of bad triangles
            for (const tri of badTriangles) {
                const edges = [
                    [tri.i, tri.j],
                    [tri.j, tri.k],
                    [tri.k, tri.i]
                ];

                for (const edge of edges) {
                    let shared = false;
                    for (const other of badTriangles) {
                        if (other === tri) continue;
                        const otherEdges = [
                            [other.i, other.j],
                            [other.j, other.k],
                            [other.k, other.i]
                        ];
                        for (const oe of otherEdges) {
                            if ((edge[0] === oe[0] && edge[1] === oe[1]) ||
                                (edge[0] === oe[1] && edge[1] === oe[0])) {
                                shared = true;
                                break;
                            }
                        }
                        if (shared) break;
                    }
                    if (!shared) {
                        polygon.push(edge);
                    }
                }
            }

            // Remove bad triangles
            triangles = triangles.filter(t => !badTriangles.includes(t));

            // Create new triangles from polygon edges to new point
            for (const edge of polygon) {
                triangles.push({ i: edge[0], j: edge[1], k: i });
            }
        }

        // Remove triangles that contain super triangle vertices
        triangles = triangles.filter(t => t.i < n && t.j < n && t.k < n);

        return triangles.map(t => [t.i, t.j, t.k]);
    }

    /**
     * Check if point is inside circumcircle of triangle
     */
    inCircumcircle(p, a, b, c) {
        const ax = a.x - p.x;
        const ay = a.y - p.y;
        const bx = b.x - p.x;
        const by = b.y - p.y;
        const cx = c.x - p.x;
        const cy = c.y - p.y;

        const det = (ax * ax + ay * ay) * (bx * cy - cx * by) -
                    (bx * bx + by * by) * (ax * cy - cx * ay) +
                    (cx * cx + cy * cy) * (ax * by - bx * ay);

        // Check triangle orientation
        const orient = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);

        return orient > 0 ? det > 0 : det < 0;
    }

    /**
     * Scale image to canvas at output dimensions
     */
    imageToCanvas(img) {
        const canvas = document.createElement('canvas');
        canvas.width = this.outputWidth;
        canvas.height = this.outputHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, this.outputWidth, this.outputHeight);
        return canvas;
    }

    /**
     * Warp and blend a triangle from both source images to destination
     */
    warpTriangle(imgData1, srcTri1, imgData2, srcTri2, outputData, dstTri, ratio) {
        // Get bounding box of destination triangle
        const minX = Math.floor(Math.min(dstTri[0].x, dstTri[1].x, dstTri[2].x));
        const maxX = Math.ceil(Math.max(dstTri[0].x, dstTri[1].x, dstTri[2].x));
        const minY = Math.floor(Math.min(dstTri[0].y, dstTri[1].y, dstTri[2].y));
        const maxY = Math.ceil(Math.max(dstTri[0].y, dstTri[1].y, dstTri[2].y));

        // Compute affine transforms from dst to each source
        const M1 = this.computeAffine(dstTri, srcTri1);
        const M2 = this.computeAffine(dstTri, srcTri2);

        // Process each pixel in bounding box
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (x < 0 || x >= this.outputWidth || y < 0 || y >= this.outputHeight) continue;

                // Check if pixel is inside triangle
                if (!this.pointInTriangle({ x, y }, dstTri)) continue;

                // Transform to source coordinates
                const src1 = this.applyAffine(M1, x, y);
                const src2 = this.applyAffine(M2, x, y);

                // Sample both source images with bilinear interpolation
                const color1 = this.sampleBilinear(imgData1, src1.x, src1.y);
                const color2 = this.sampleBilinear(imgData2, src2.x, src2.y);

                // Blend colors
                const idx = (y * this.outputWidth + x) * 4;
                outputData.data[idx] = color1.r * (1 - ratio) + color2.r * ratio;
                outputData.data[idx + 1] = color1.g * (1 - ratio) + color2.g * ratio;
                outputData.data[idx + 2] = color1.b * (1 - ratio) + color2.b * ratio;
                outputData.data[idx + 3] = 255;
            }
        }
    }

    /**
     * Compute affine transformation matrix from src triangle to dst triangle
     */
    computeAffine(src, dst) {
        const x1 = src[0].x, y1 = src[0].y;
        const x2 = src[1].x, y2 = src[1].y;
        const x3 = src[2].x, y3 = src[2].y;

        const u1 = dst[0].x, v1 = dst[0].y;
        const u2 = dst[1].x, v2 = dst[1].y;
        const u3 = dst[2].x, v3 = dst[2].y;

        const denom = (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);

        if (Math.abs(denom) < 1e-10) {
            return { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 };
        }

        const a = ((u1 - u3) * (y2 - y3) - (u2 - u3) * (y1 - y3)) / denom;
        const b = ((u2 - u3) * (x1 - x3) - (u1 - u3) * (x2 - x3)) / denom;
        const c = u3 - a * x3 - b * y3;

        const d = ((v1 - v3) * (y2 - y3) - (v2 - v3) * (y1 - y3)) / denom;
        const e = ((v2 - v3) * (x1 - x3) - (v1 - v3) * (x2 - x3)) / denom;
        const f = v3 - d * x3 - e * y3;

        return { a, b, c, d, e, f };
    }

    /**
     * Apply affine transformation
     */
    applyAffine(M, x, y) {
        return {
            x: M.a * x + M.b * y + M.c,
            y: M.d * x + M.e * y + M.f
        };
    }

    /**
     * Check if point is inside triangle using barycentric coordinates
     */
    pointInTriangle(p, tri) {
        const v0 = { x: tri[2].x - tri[0].x, y: tri[2].y - tri[0].y };
        const v1 = { x: tri[1].x - tri[0].x, y: tri[1].y - tri[0].y };
        const v2 = { x: p.x - tri[0].x, y: p.y - tri[0].y };

        const dot00 = v0.x * v0.x + v0.y * v0.y;
        const dot01 = v0.x * v1.x + v0.y * v1.y;
        const dot02 = v0.x * v2.x + v0.y * v2.y;
        const dot11 = v1.x * v1.x + v1.y * v1.y;
        const dot12 = v1.x * v2.x + v1.y * v2.y;

        const inv = 1 / (dot00 * dot11 - dot01 * dot01);
        const u = (dot11 * dot02 - dot01 * dot12) * inv;
        const v = (dot00 * dot12 - dot01 * dot02) * inv;

        return (u >= 0) && (v >= 0) && (u + v <= 1);
    }

    /**
     * Bilinear interpolation sampling
     */
    sampleBilinear(imgData, x, y) {
        const w = this.outputWidth;
        const h = this.outputHeight;

        // Clamp coordinates
        x = Math.max(0, Math.min(w - 1.001, x));
        y = Math.max(0, Math.min(h - 1.001, y));

        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(x0 + 1, w - 1);
        const y1 = Math.min(y0 + 1, h - 1);

        const fx = x - x0;
        const fy = y - y0;

        const getPixel = (px, py) => {
            const idx = (py * w + px) * 4;
            return {
                r: imgData.data[idx],
                g: imgData.data[idx + 1],
                b: imgData.data[idx + 2]
            };
        };

        const p00 = getPixel(x0, y0);
        const p10 = getPixel(x1, y0);
        const p01 = getPixel(x0, y1);
        const p11 = getPixel(x1, y1);

        return {
            r: (p00.r * (1 - fx) + p10.r * fx) * (1 - fy) + (p01.r * (1 - fx) + p11.r * fx) * fy,
            g: (p00.g * (1 - fx) + p10.g * fx) * (1 - fy) + (p01.g * (1 - fx) + p11.g * fx) * fy,
            b: (p00.b * (1 - fx) + p10.b * fx) * (1 - fy) + (p01.b * (1 - fx) + p11.b * fx) * fy
        };
    }
}

// Export for use in app.js
window.FaceMorpher = FaceMorpher;
