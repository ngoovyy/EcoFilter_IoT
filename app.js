(function() {
    // ==========================================
    //        🔴        PHẦN CẤU HÌNH FIREBASE KẾT NỐI
    // ==========================================
    const firebaseConfig = {
        apiKey: "AIzaSyCTL732xXKFUOtZnueYzoBtz_dyhOS1p_8",
        authDomain: "ecofilter-iot.firebaseapp.com",
        databaseURL: "https://ecofilter-iot-default-rtdb.firebaseio.com",
        projectId: "ecofilter-iot",
        storageBucket: "ecofilter-iot.firebasestorage.app",
        messagingSenderId: "611838926722",
        appId: "1:611838926722:web:00cfe4ee3ba927c1d7799b",
        measurementId: "G-M0Z7Q3L90K"
    };

    let app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const database = app.database();

    // ==========================================
    //        🟢        BIẾN TOÀN CỤC, AI & ĐỒ THỊ
    // ==========================================
    const maxCapacity = 100; // Khối lượng vi nhựa bão hòa tối đa (mg)
    let realtimeChart = null;
    let ai_coefficient_a = 1.30; 
    
    let lastPlasticMass = 0;
    let lastTimestamp = Date.now();
    let estimatedMinutesLeft = 345; 

    document.addEventListener("DOMContentLoaded", () => {
        setupChart();
        setupGeoButtons();
        startFirebaseListening();
    });

    // ==========================================
    //        🔵        THUẬT TOÁN ĐỒ THỊ REALTIME
    // ==========================================
    function setupChart() {
        const ctx = document.getElementById('realtimeChart').getContext('2d');
        realtimeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Lưu lượng nước (L)',
                        data: [],
                        borderColor: '#00ffb7',
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#00ffb7',
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Vi nhựa ước tính (mg)',
                        data: [],
                        borderColor: '#ff5e62',
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#ff5e62',
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8ecae6' } },
                    y: {
                        type: 'linear', display: true, position: 'left',
                        grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#00ffb7' },
                        title: { display: true, text: 'Lít (L)', color: '#00ffb7' }
                    },
                    y1: {
                        type: 'linear', display: true, position: 'right',
                        ticks: { color: '#ff5e62' }, title: { display: true, text: 'Milligram (mg)', color: '#ff5e62' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: { legend: { labels: { color: '#fff', font: { size: 12 } } } }
            }
        });
    }

    // ==========================================
    //        🟡        THUẬT TOÁN ĐỊNH VỊ GPS VÀ HỆ SỐ AI
    // ==========================================
    function setupGeoButtons() {
        const btnGPS = document.getElementById('btn-gps');
        const btnManual1 = document.getElementById('btn-manual-1');
        const btnManual2 = document.getElementById('btn-manual-2');
        const regionLabel = document.getElementById('current-region');

        function updateActiveButton(activeBtn) {
            [btnGPS, btnManual1, btnManual2].forEach(btn => { if(btn) btn.classList.remove('active'); });
            if(activeBtn) activeBtn.classList.add('active');
        }

        if(btnGPS) {
            btnGPS.addEventListener('click', () => {
                updateActiveButton(btnGPS);
                regionLabel.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Đang quét định vị GPS...";
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        const lat = position.coords.latitude;
                        if (lat > 10.75) {
                            ai_coefficient_a = 1.30;
                            regionLabel.innerText = "Hạ lưu sông / Khu công nghiệp (Hệ số: 1.30 mg/L)";
                        } else {
                            ai_coefficient_a = 0.45;
                            regionLabel.innerText = "Khu dân cư nội đô (Hệ số: 0.45 mg/L)";
                        }
                    }, (error) => {
                        ai_coefficient_a = 1.30;
                        regionLabel.innerText = "Lỗi GPS. Mặc định: Vùng hạ lưu (1.30 mg/L)";
                    });
                } else {
                    regionLabel.innerText = "Trình duyệt không hỗ trợ GPS.";
                }
            });
        }

        if(btnManual1) {
            btnManual1.addEventListener('click', () => {
                updateActiveButton(btnManual1);
                ai_coefficient_a = 1.30;
                regionLabel.innerText = "Hạ lưu sông / Khu công nghiệp (Hệ số: 1.30 mg/L)";
            });
        }

        if(btnManual2) {
            btnManual2.addEventListener('click', () => {
                updateActiveButton(btnManual2);
                ai_coefficient_a = 0.45;
                regionLabel.innerText = "Khu dân cư nội đô (Hệ số: 0.45 mg/L)";
            });
        }
    }

    // ==========================================
    //        🔮        THUẬT TOÁN ĐỒNG BỘ VÀ CẬP NHẬT GIAO DIỆN
    // ==========================================
    function updateUserInterface(waterVolume, microplasticMass, minutesLeft) {
        document.getElementById('water-volume').innerText = waterVolume.toFixed(2);
        document.getElementById('plastic-mass').innerText = microplasticMass.toFixed(2);
        
        const percentage = (microplasticMass / maxCapacity) * 100;
        const progressFill = document.getElementById('progress-fill');
        const progressPercent = document.getElementById('progress-percent');
        
        if(progressFill) progressFill.style.width = `${percentage > 100 ? 100 : percentage}%`;
        if(progressPercent) progressPercent.innerText = `${percentage.toFixed(1)}%`;

        if (progressFill) {
            if (percentage > 80) progressFill.style.background = '#ff5e62';
            else if (percentage > 50) progressFill.style.background = '#f59e0b';
            else progressFill.style.background = '#00ffb7';
        }

        const countdownLabel = document.getElementById('ai-countdown');
        if(countdownLabel) {
            if (minutesLeft <= 0 || percentage >= 100) {
                countdownLabel.innerHTML = "<span style='color: #ff5e62; font-weight: bold;'>BẢO TRÌ NGAY!</span>";
            } else {
                const hrs = Math.floor(minutesLeft / 60);
                const mins = Math.round(minutesLeft % 60);
                countdownLabel.innerText = `${hrs} Giờ ${mins} Phút`;
            }
        }

        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (realtimeChart) {
            realtimeChart.data.labels.push(timeString);
            realtimeChart.data.datasets[0].data.push(waterVolume);
            realtimeChart.data.datasets[1].data.push(microplasticMass);

            if (realtimeChart.data.labels.length > 10) {
                realtimeChart.data.labels.shift();
                realtimeChart.data.datasets[0].data.shift();
                realtimeChart.data.datasets[1].data.shift();
            }
            realtimeChart.update();
        }

        const tableBody = document.querySelector('.history-table tbody');
        if(tableBody) {
            const newRow = document.createElement('tr');
            let statusText = "Ổn định"; let statusClass = "status-good";
            if (percentage > 80) { statusText = "Nguy cơ cao"; statusClass = "status-danger"; }
            else if (percentage > 50) { statusText = "Cần lưu ý"; statusClass = "status-warn"; }

            newRow.innerHTML = `
                <td>${timeString}</td>
                <td>${waterVolume.toFixed(2)} L</td>
                <td style="color: #ff5e62; font-weight: 500;">${microplasticMass.toFixed(2)} mg</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            `;
            tableBody.insertBefore(newRow, tableBody.firstChild);
            if (tableBody.children.length > 5) tableBody.removeChild(tableBody.lastChild);
        }
    }

    function startFirebaseListening() {
        database.ref().on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            let waterVolume = data.waterVolume !== undefined ? parseFloat(data.waterVolume) : 0.0;
            let microplasticMass = data.microplasticMass !== undefined ? parseFloat(data.microplasticMass) : (waterVolume * ai_coefficient_a);

            const now = Date.now();
            const timePassedMinutes = (now - lastTimestamp) / 60000;
            
            if (timePassedMinutes > 0 && microplasticMass > lastPlasticMass && lastPlasticMass > 0) {
                let accumulationRate = (microplasticMass - lastPlasticMass) / timePassedMinutes;
                let plasticRemaining = maxCapacity - microplasticMass;
                if (plasticRemaining < 0) plasticRemaining = 0;
                if (accumulationRate > 0) estimatedMinutesLeft = plasticRemaining / accumulationRate;
            } else {
                estimatedMinutesLeft = 345;
            }

            lastPlasticMass = microplasticMass;
            lastTimestamp = now;

            updateUserInterface(waterVolume, microplasticMass, estimatedMinutesLeft);
        }, (error) => {
            console.error("[FIREBASE CONNECTION ERROR]", error);
        });
    }
})();

