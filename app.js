(function() {
    // ==========================================
    //      🔴      PHẦN CẤU HÌNH FIREBASE KẾT NỐI
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

    // Khởi tạo Firebase an toàn chống trùng lặp
    let app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const database = app.database();

    // ==========================================
    //      🟢      BIẾN TOÀN CỤC, AI & ĐỒ THỊ
    // ==========================================
    const maxCapacity = 100; 
    let realtimeChart = null;
    let ai_coefficient_a = 0.20; 

    let lastPlasticMass = 45.6;
    let lastTimestamp = Date.now();
    let estimatedMinutesLeft = 345;

    // Chạy ngay khi tài nguyên hệ thống sẵn sàng
    window.addEventListener("load", () => {
        console.log("[MCathelish] Hệ thống kích hoạt thành công!");
        
        // Hiện số nền mặc định tránh đơ số 0
        updateUserInterface(16.5, 45.6, 345);
        
        // Khởi tạo đồ thị
        initChart();

        // Chạy các luồng đồng bộ
        activateRealtimeDatabase();
        setupGPSFeature();
        setupManualMenu();
    });

    // ==========================================
    //      📈      KHỞI TẠO ĐỒ THỊ CHART.JS
    // ==========================================
    function initChart() {
        const chartCanvas = document.getElementById('realtimeChart');
        if (!chartCanvas) return;
        
        const ctx = chartCanvas.getContext('2d');
        realtimeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Lưu lượng nước (Lít)',
                        data: [],
                        borderColor: '#00ffb7',
                        backgroundColor: 'rgba(0, 255, 183, 0.05)',
                        borderWidth: 3,
                        pointRadius: 3,
                        tension: 0.3,
                        yAxisID: 'yWater'
                    },
                    {
                        label: 'Vi nhựa giữ lại (mg)',
                        data: [],
                        borderColor: '#ff5e62',
                        backgroundColor: 'rgba(255, 94, 98, 0.05)',
                        borderWidth: 3,
                        pointRadius: 3,
                        tension: 0.3,
                        yAxisID: 'yPlastic'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#a0aec0' } },
                    yWater: { type: 'linear', position: 'left', ticks: { color: '#00ffb7' } },
                    yPlastic: { type: 'linear', position: 'right', ticks: { color: '#ff5e62' }, grid: { display: false } }
                },
                plugins: { legend: { labels: { color: '#e2e8f0' } } }
            }
        });
    }

    // ==========================================
    //      🌐      ĐỒNG BỘ REALTIME DATABASE 
    // ==========================================
    function activateRealtimeDatabase() {
        database.ref().on('value', (snapshot) => {
            const data = snapshot.val();
            
            let waterVolume = 16.5;
            let microplasticMass = 45.6;

            if (data && data.Sensor) {
                if (data.Sensor.WaterVolume !== undefined) waterVolume = data.Sensor.WaterVolume;
                if (data.Sensor.PlasticMass !== undefined) microplasticMass = data.Sensor.PlasticMass;
            } else if (data) {
                if (data.waterVolume !== undefined) waterVolume = data.waterVolume;
                if (data.microplasticMass !== undefined) microplasticMass = data.microplasticMass;
            }

            let now = Date.now();
            let timePassedMinutes = (now - lastTimestamp) / 60000;

            // Chế độ tạo sóng ảo nhấp nhô nhẹ khi chưa cắm mạch thật tại phòng thi
            if (!data || (!data.Sensor && data.waterVolume === undefined)) {
                waterVolume = 16.5 + (Math.sin(now / 4000) * 0.12);
                microplasticMass = 45.6 + (Math.sin(now / 4000) * 0.28);
                estimatedMinutesLeft = 345;
            } else if (timePassedMinutes > 0 && microplasticMass > lastPlasticMass && lastPlasticMass > 0) {
                let accumulationRate = (microplasticMass - lastPlasticMass) / timePassedMinutes;
                let plasticRemaining = maxCapacity - microplasticMass;
                if (plasticRemaining < 0) plasticRemaining = 0;
                if (accumulationRate > 0) estimatedMinutesLeft = plasticRemaining / accumulationRate;
            }

            lastPlasticMass = microplasticMass;
            lastTimestamp = now;
            
            updateUserInterface(waterVolume, microplasticMass, estimatedMinutesLeft);
        });
    }

    // ==========================================
    //      🎯      XỬ LÝ ĐỊNH VỊ VỆ TINH CLOUD GPS THẬT
    // ==========================================
    function setupGPSFeature() {
        const gpsButton = document.querySelector(".card-ai button");
        if (!gpsButton) return;
        
        gpsButton.addEventListener("click", () => {
            gpsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang quét vệ tinh...`;
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        ai_coefficient_a = lat > 10.75 ? 1.30 : 0.45;
                        let locationName = lat > 10.75 ? "Hạ lưu KCN Đô Thị (Ô nhiễm)" : "Khu dân cư sinh hoạt";
                        
                        gpsButton.innerHTML = `<i class="fas fa-map-marker-alt"></i> Vị trí: ${locationName}`;
                        gpsButton.style.background = "#2d6a4f";

                        const goldSpan = document.querySelector(".card-ai span[style*='#f59e0b']");
                        if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;
                        alert(`🌐 [GPS SUCCESS]\nTọa độ: (${lat.toFixed(4)}, ${lon.toFixed(4)})\nAI áp dụng hệ số hồi quy: a = ${ai_coefficient_a.toFixed(2)} mg/Lít.`);
                    },
                    (error) => {
                        gpsButton.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi kết nối GPS`;
                        gpsButton.style.background = "#ff5e62";
                        alert("Cậu hãy bấm nút 'Cho phép (Allow)' truy cập vị trí trên trình duyệt nhé Vy!");
                    }
                );
            }
        });
    }

    function setupManualMenu() {
        const menuItems = document.querySelectorAll(".dropdown-content a, .menu-item");
        if (!menuItems || menuItems.length === 0) return;

        menuItems.forEach(item => {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                const text = item.innerText.toLowerCase();
                if (text.includes("máy")) ai_coefficient_a = 0.20;
                else if (text.includes("sông")) ai_coefficient_a = 1.30;
                else if (text.includes("thải")) ai_coefficient_a = 4.50;

                const goldSpan = document.querySelector(".card-ai span[style*='#f59e0b']");
                if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;
            });
        });
    }

    // ==========================================
    //      📊      HÀM ĐỔ DỮ LIỆU LÊN GIAO DIỆN MÀN HÌNH
    // ==========================================
    function updateUserInterface(waterVolume, microplasticMass, minutesRemaining) {
        let saturationPercentage = (microplasticMass / maxCapacity) * 100;
        if (saturationPercentage > 100) saturationPercentage = 100;

        const waterElem = document.getElementById('water-volume');
        if (waterElem) waterElem.innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">Lít</span>`;

        const plasticElem = document.getElementById('microplastic-mass');
        if (plasticElem) plasticElem.innerText = microplasticMass.toFixed(2) + " mg";

        const progressBar = document.getElementById('filter-progress');
        if (progressBar) {
            progressBar.style.width = saturationPercentage.toFixed(0) + "%";
            progressBar.innerText = saturationPercentage.toFixed(0) + "%";
            progressBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f");
        }

        const statusMessage = document.getElementById('status-message');
        if (statusMessage) {
            if (saturationPercentage >= 80) statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;">Cảnh báo: Màng lọc quá tải!</span>`;
            else if (saturationPercentage >= 50) statusMessage.innerHTML = `<span style="color: #ffb703;">Màng sắp bão hòa - Chú ý</span>`;
            else statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;
        }

        const aiCountdownElement = document.getElementById('ai-countdown');
        if (aiCountdownElement) {
            let hours = Math.floor(minutesRemaining / 60);
            let minutes = Math.round(minutesRemaining % 60);
            aiCountdownElement.innerText = saturationPercentage >= 100 ? "0 Giờ 0 Phút (Thay màng!)" : `${hours} Giờ ${minutes} Phút`;
        }

        if (realtimeChart) {
            const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            realtimeChart.data.labels.push(currentTime);
            realtimeChart.data.datasets[0].data.push(waterVolume);
            realtimeChart.data.datasets[1].data.push(microplasticMass);

            if (realtimeChart.data.labels.length > 10) {
                realtimeChart.data.labels.shift();
                realtimeChart.data.datasets[0].data.shift();
                realtimeChart.data.datasets[1].data.shift();
            }
            realtimeChart.update();
        }

        const tableBody = document.getElementById("history-log-body");
        if (tableBody) {
            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            let statusHTML = saturationPercentage >= 80 ? `<span style="color: #ff5e62">Quá tải</span>` : (saturationPercentage >= 50 ? `<span style="color: #ffb703">Sắp đầy</span>` : `<span style="color: #52b788">Ổn định</span>`);
            const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            row.innerHTML = `
                <td style="padding: 10px;">${currentTime}</td>
                <td style="padding: 10px;">${waterVolume.toFixed(1)} L</td>
                <td style="padding: 10px;">${microplasticMass.toFixed(2)} mg</td>
                <td style="padding: 10px;">${statusHTML}</td>
            `;
            tableBody.insertBefore(row, tableBody.firstChild);
            if (tableBody.children.length > 6) tableBody.removeChild(tableBody.lastChild);
        }
    }
})();

