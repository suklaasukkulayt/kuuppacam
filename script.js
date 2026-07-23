            const ipInput = document.getElementById('ipAddress');
            const applyButton = document.getElementById('applyButton');
            const videoFeed = document.getElementById('videoFeed');
            const audioFeed = document.getElementById('audioFeed');
            const captureCanvas = document.getElementById('captureCanvas');
            const captureContext = captureCanvas.getContext('2d');
            const recordButton = document.getElementById('recordButton');
            const stopButton = document.getElementById('stopButton');
            const downloadLink = document.getElementById('downloadLink');

            let mediaRecorder = null;
            let recordedChunks = [];
            let canvasAnimationId = null;

            function normalizeBaseUrl(value) {
                const raw = (value || '').trim();
                if (!raw) {
                    return '';
                }

                const withoutProtocol = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
                const hasPath = withoutProtocol.includes('/');
                const hostAndPort = hasPath ? withoutProtocol.split('/')[0] : withoutProtocol;

                if (/^\d+\.\d+\.\d+\.\d+$/.test(hostAndPort)) {
                    return `https://${hostAndPort}:8080`;
                }

                if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(hostAndPort)) {
                    const [host, port] = hostAndPort.split(':');
                    return `https://${host}:${port}`;
                }

                if (/^https?:\/\//i.test(raw)) {
                    return raw.replace(/\/$/, '');
                }

                return `https://${hostAndPort}:8080`;
            }

            function updateCameraFeed() {
                const baseUrl = normalizeBaseUrl(ipInput.value);
                const cacheBuster = `?ts=${Date.now()}`;

                if (!baseUrl) {
                    videoFeed.removeAttribute('src');
                    audioFeed.innerHTML = '<source src="" type="audio/wav">';
                    audioFeed.load();
                    return;
                }

                const videoUrl = `${baseUrl}/video${cacheBuster}`;
                const audioUrl = `${baseUrl}/audio.wav${cacheBuster}`;

                videoFeed.crossOrigin = 'anonymous';
                videoFeed.src = videoUrl;
                videoFeed.onload = () => {
                    console.log('Video URL updated to', videoUrl);
                    startCanvasLoop();
                };

                audioFeed.crossOrigin = 'anonymous';
                audioFeed.innerHTML = `<source src="${audioUrl}" type="audio/wav">`;
                audioFeed.load();
                console.log('Audio URL updated to', audioUrl);
            }

            function updateCanvasFrame() {
                if (videoFeed.naturalWidth && videoFeed.naturalHeight) {
                    if (captureCanvas.width !== videoFeed.naturalWidth || captureCanvas.height !== videoFeed.naturalHeight) {
                        captureCanvas.width = videoFeed.naturalWidth;
                        captureCanvas.height = videoFeed.naturalHeight;
                    }
                    captureContext.drawImage(videoFeed, 0, 0, captureCanvas.width, captureCanvas.height);
                }
                canvasAnimationId = requestAnimationFrame(updateCanvasFrame);
            }

            function startCanvasLoop() {
                if (!canvasAnimationId) {
                    updateCanvasFrame();
                }
            }

            function stopCanvasLoop() {
                if (canvasAnimationId) {
                    cancelAnimationFrame(canvasAnimationId);
                    canvasAnimationId = null;
                }
            }

            function isCanvasClean() {
                try {
                    captureCanvas.toDataURL('image/png');
                    return true;
                } catch (error) {
                    return false;
                }
            }

            function createRecorder() {
                if (!captureCanvas.captureStream) {
                    alert('Recording is not supported in this browser. canvas.captureStream() is required.');
                    return null;
                }
                if (!audioFeed.captureStream) {
                    alert('Recording audio is not supported in this browser. audio.captureStream() is required.');
                    return null;
                }
                if (!isCanvasClean()) {
                    alert('Recording is blocked because the camera image source is cross-origin and the canvas is tainted. Use a CORS-enabled camera or a proxy server.');
                    return null;
                }

                const videoStream = captureCanvas.captureStream(15);
                const audioStream = audioFeed.captureStream();
                const combinedStream = new MediaStream();

                videoStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
                audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

                const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus')
                    ? 'video/webm; codecs=vp8,opus'
                    : 'video/webm';

                const recorder = new MediaRecorder(combinedStream, { mimeType });

                recorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        recordedChunks.push(event.data);
                    }
                };

                recorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    downloadLink.href = url;
                    downloadLink.style.display = 'inline-block';
                    downloadLink.textContent = 'Download recording';
                    downloadLink.download = `kuuppacam_${Date.now()}.webm`;
                };

                return recorder;
            }

            function startRecording() {
                recordedChunks = [];
                startCanvasLoop();
                mediaRecorder = createRecorder();
                if (!mediaRecorder) {
                    stopCanvasLoop();
                    return;
                }

                audioFeed.muted = false;
                audioFeed.play().catch(() => {
                    console.log('Audio autoplay failed. User interaction may be required.');
                });

                mediaRecorder.start();
                recordButton.disabled = true;
                stopButton.disabled = false;
                downloadLink.style.display = 'none';
                console.log('Recording started');
            }

            function stopRecording() {
                if (!mediaRecorder || mediaRecorder.state !== 'recording') {
                    return;
                }

                mediaRecorder.stop();
                stopCanvasLoop();
                recordButton.disabled = false;
                stopButton.disabled = true;
                console.log('Recording stopped');
            }

            applyButton.addEventListener('click', updateCameraFeed);
            ipInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    updateCameraFeed();
                }
            });
            recordButton.addEventListener('click', startRecording);
            stopButton.addEventListener('click', stopRecording);

            updateCameraFeed();