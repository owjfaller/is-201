/**
 * Face Merge Application
 * Main application logic for the face morphing web app
 */

class FaceMergeApp {
    constructor() {
        this.morpher = new FaceMorpher();
        this.face1 = null;
        this.face2 = null;
        this.landmarks1 = null;
        this.landmarks2 = null;
        this.modelsLoaded = false;

        this.initElements();
        this.initEventListeners();
        this.loadModels();
    }

    initElements() {
        this.loadingEl = document.getElementById('loading');
        this.appEl = document.getElementById('app');
        this.errorEl = document.getElementById('error');

        this.upload1 = document.getElementById('upload1');
        this.upload2 = document.getElementById('upload2');
        this.file1 = document.getElementById('file1');
        this.file2 = document.getElementById('file2');
        this.preview1 = document.getElementById('preview1');
        this.preview2 = document.getElementById('preview2');

        this.controls = document.getElementById('controls');
        this.blendSlider = document.getElementById('blendSlider');
        this.blendValue = document.getElementById('blendValue');

        this.resultSection = document.getElementById('result-section');
        this.resultCanvas = document.getElementById('resultCanvas');
        this.downloadBtn = document.getElementById('downloadBtn');
    }

    initEventListeners() {
        // Upload box clicks
        this.upload1.addEventListener('click', () => this.file1.click());
        this.upload2.addEventListener('click', () => this.file2.click());

        // File inputs
        this.file1.addEventListener('change', (e) => this.handleFileSelect(e, 1));
        this.file2.addEventListener('change', (e) => this.handleFileSelect(e, 2));

        // Drag and drop
        [this.upload1, this.upload2].forEach((box, idx) => {
            box.addEventListener('dragover', (e) => {
                e.preventDefault();
                box.style.borderColor = '#00d9ff';
            });

            box.addEventListener('dragleave', () => {
                box.style.borderColor = '';
            });

            box.addEventListener('drop', (e) => {
                e.preventDefault();
                box.style.borderColor = '';
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                    this.processFile(file, idx + 1);
                }
            });
        });

        // Blend slider
        this.blendSlider.addEventListener('input', () => {
            this.blendValue.textContent = this.blendSlider.value;
            if (this.landmarks1 && this.landmarks2) {
                this.performMorph();
            }
        });

        // Download button
        this.downloadBtn.addEventListener('click', () => this.downloadResult());
    }

    async loadModels() {
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
            ]);

            this.modelsLoaded = true;
            this.loadingEl.classList.add('hidden');
            this.appEl.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading models:', error);
            this.showError('Failed to load face detection models. Please refresh the page.');
        }
    }

    handleFileSelect(event, faceNumber) {
        const file = event.target.files[0];
        if (file) {
            this.processFile(file, faceNumber);
        }
    }

    async processFile(file, faceNumber) {
        const reader = new FileReader();

        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                // Store image and show preview
                if (faceNumber === 1) {
                    this.face1 = img;
                    this.preview1.src = e.target.result;
                    this.preview1.classList.remove('hidden');
                    this.upload1.querySelector('.upload-content').classList.add('hidden');
                    this.upload1.classList.add('has-image');
                } else {
                    this.face2 = img;
                    this.preview2.src = e.target.result;
                    this.preview2.classList.remove('hidden');
                    this.upload2.querySelector('.upload-content').classList.add('hidden');
                    this.upload2.classList.add('has-image');
                }

                // Detect face landmarks
                await this.detectFace(img, faceNumber);
            };
            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    }

    async detectFace(img, faceNumber) {
        this.hideError();

        try {
            const detection = await faceapi
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks();

            if (!detection) {
                this.showError(`No face detected in image ${faceNumber}. Please try a different photo.`);
                return;
            }

            const landmarks = detection.landmarks.positions.map(pt => ({
                x: pt.x,
                y: pt.y
            }));

            if (faceNumber === 1) {
                this.landmarks1 = landmarks;
            } else {
                this.landmarks2 = landmarks;
            }

            // If both faces are ready, show controls and perform morph
            if (this.landmarks1 && this.landmarks2) {
                this.controls.classList.remove('hidden');
                this.resultSection.classList.remove('hidden');
                this.performMorph();
            }
        } catch (error) {
            console.error('Face detection error:', error);
            this.showError('Error detecting face. Please try a different image.');
        }
    }

    performMorph() {
        const ratio = this.blendSlider.value / 100;

        try {
            const morphedData = this.morpher.morph(
                this.face1,
                this.face2,
                this.landmarks1,
                this.landmarks2,
                ratio
            );

            // Draw result to canvas
            this.resultCanvas.width = this.morpher.outputWidth;
            this.resultCanvas.height = this.morpher.outputHeight;
            const ctx = this.resultCanvas.getContext('2d');
            ctx.putImageData(morphedData, 0, 0);
        } catch (error) {
            console.error('Morphing error:', error);
            this.showError('Error morphing faces. Please try different images.');
        }
    }

    downloadResult() {
        const link = document.createElement('a');
        link.download = 'face-merge-result.png';
        link.href = this.resultCanvas.toDataURL('image/png');
        link.click();
    }

    showError(message) {
        this.errorEl.textContent = message;
        this.errorEl.classList.remove('hidden');
    }

    hideError() {
        this.errorEl.classList.add('hidden');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new FaceMergeApp();
});
