(function() {
    // Firebase Config
    const firebaseConfig = {
        apiKey: "AIzaSyCTL732xXKFUOtZnueYzoBtz_dyhOS1p_8",
        authDomain: "ecofilter-iot.firebaseapp.com",
        databaseURL: "https://ecofilter-iot-default-rtdb.firebaseio.com",
        projectId: "ecofilter-iot",
        storageBucket: "ecofilter-iot.firebasestorage.app",
        messagingSenderId: "611838926722",
        appId: "1:611838926722:web:00cfe4ee3ba927c1d7799b"
    };

    let app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const database = app.database();

    // DỮ LIỆU CÁC KHU VỰC THỰC NGHIỆM ĐỂ KHỚP HỆ SỐ ALPHA
    const REGIONAL_LOCATIONS = [
        { code: "P1", name: "Khu chế xuất Tân Thuận (Quận 7)", lat: 10.748, lon: 106.726, group: "Khu công nghiệp", alpha: 1.30 },
        { code: "P2", name: "Khu công nghiệp Hiệp Phước (Nhà Bè)", lat: 10.660, lon: 106.742, group: "Khu công nghiệp", alpha: 1.35 },
        { code: "P3", name: "Khu công nghiệp Tân Bình", lat: 10.801, lon: 106.639, group: "Khu công nghiệp", alpha: 1.25 },
        { code: "P4", name: "Hồ Bán Nguyệt (Phú Mỹ Hưng)", lat: 10.729, lon: 106.722, group: "Nước mặt đô thị", alpha: 0.70 },
        { code: "P5", name: "Công viên Tao Đàn", lat: 10.776, lon: 106.691, group: "Nước mặt đô thị", alpha: 0.65 },
        { code: "P6", name: "Khu dân cư Bình Chánh", lat: 10.823, lon: 106.593, group: "Nước sinh hoạt", alpha: 0.45 },
        { code: "P7", name: "Khu dân cư Quận 12", lat: 10.868, lon: 106.640, group: "Nước sinh hoạt", alpha: 0.45 },
        { code: "P8", name: "Khu dân cư Thủ Đức", lat: 10.849, lon: 106.772, group: "Nước sinh hoạt", alpha: 0.50 }
    ];

    const M_MAX = 100.0; // Sức chứa bão hòa tối đa M_max = 100 mg
    let alpha_coefficient = 0.45;
    let realtimeChart = null;
    let lastPlasticMass = 0;
    let lastTimestamp = Date.now();
    let estimatedMinutesLeft = 360;
    let isRelayOff = false;

    window.addEventListener("load", () => {
        initRealtimeChart();
        setupGPSFeature();
        setupRelayManualControl();
        connectFirebaseRealtime();
    });

    // =====================================================
    // THUẬT TOÁN: TÍNH KHOẢNG CÁCH HAVERSINE
    // =====================================================
    function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371.0;
        const dLat = (lat2 - lat1) * Math.PI / 180.0;
        const dLon = (lon2 - lon1) * Math.PI / 180.0;
        const a = Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
                  Math.cos(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) *
                  Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);
        return R * (2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a)));
    }

    function setupGPSFeature() {
        const btnGps = document.getElementById("btn-gps");
        const gpsInfo = document.getElementById("gps-info");
        if (!btnGps) return;

        btnGps.addEventListener("click", () => {
            btnGps.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tính toán vị trí...`;
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const uLat = position.coords.latitude;
                        const uLon = position.coords.longitude;
                        let minDist = Infinity;
                        let nearest = REGIONAL_LOCATIONS[0];

                        REGIONAL_LOCATIONS.forEach(loc => {
                            let d = calculateHaversineDistance(uLat, uLon, loc.lat, loc.lon);
                            if (d < minDist) { minDist = d; nearest = loc; }
                        });

                        alpha_coefficient = nearest.alpha;
                        btnGps.innerHTML = `<i class="fas fa-location-crosshairs"></i> Định vị GPS & Khớp Hệ Số α`;
                        if (gpsInfo) gpsInfo.textContent = `Tọa độ: (${uLat.toFixed(3)}, ${uLon.toFixed(3)}) | Khu vực: ${nearest.code} (${minDist.toFixed(2)} km)`;
                        
                        document.getElementById("waterSource").textContent = `${nearest.code} - ${nearest.name}`;
                        document.getElementById("alphaCoeffText").textContent = `Nhóm: ${nearest.group} | Hệ số α = ${nearest.alpha.toFixed(2)} mg/L`;

                        // Đồng bộ lên Firebase
                        database.ref("/EcoFilter/gps").set({ latitude: uLat, longitude: uLon });
                        database.ref("/EcoFilter/currentLocation").set({
                            pointID: nearest.code,
                            pointName: nearest.name,
                            alphaCoeff: nearest.alpha,
                            sourceType: nearest.group
                        });
                    },
                    (error) => {
                        alpha_coefficient = 0.45;
                        btnGps.innerHTML = `<i class="fas fa-location-crosshairs"></i> Định vị GPS & Khớp Hệ Số α`;
                        if (gpsInfo) gpsInfo.textContent = `Không lấy được GPS. Mặc định chọn khu vực P6 (Bình Chánh)`;
                        document.getElementById("waterSource").textContent = "P6 - Khu dân cư Bình Chánh";
                        document.getElementById("alphaCoeffText").textContent = "Nhóm: Nước sinh hoạt | Hệ số α = 0.45 mg/L";

                        database.ref("/EcoFilter/currentLocation").set({
                            pointID: "P6",
                            pointName: "Khu dân cư Bình Chánh",
                            alphaCoeff: 0.45,
                            sourceType: "Nước sinh hoạt"
                        });
                    }
                );
            }
        });
    }

    // =====================================================
    // ĐIỀU KHIỂN RELAY MÁY BƠM
    // =====================================================
    function setupRelayManualControl() {
        const btnToggle = document.getElementById("btn-toggle-relay");
        if (!btnToggle) return;
        btnToggle.addEventListener("click", () => {
            isRelayOff = !isRelayOff;
            database.ref("/EcoFilter/relay/relayOff").set(isRelayOff);
        });
    }

    // =====================================================
    // LẮNG NGHE REALTIME FIREBASE
    // =====================================================
    function connectFirebaseRealtime() {
        // Lắng nghe nút ngắt Relay
        database.ref("/EcoFilter/relay/relayOff").on("value", (snapshot) => {
            isRelayOff = snapshot.val() === true;
            const statusText = document.getElementById("relay-status-text");
            const btnToggle = document.getElementById("btn-toggle-relay");
            if (isRelayOff) {
                if (statusText) { statusText.textContent = "ĐÃ NGẮT (DỪNG BƠM)"; statusText.style.color = "#dc2626"; }
                if (btnToggle) { btnToggle.className = "btn-action btn-success"; btnToggle.innerHTML = `<i class="fas fa-play"></i> Bật Lại Máy Bơm`; }
            } else {
                if (statusText) { statusText.textContent = "ĐANG BẬT (HOẠT ĐỘNG)"; statusText.style.color = "#16a34a"; }
                if (btnToggle) { btnToggle.className = "btn-action btn-danger"; btnToggle.innerHTML = `<i class="fas fa-power-off"></i> Ngắt Máy Bơm Khẩn Cấp`; }
            }
        });

        // Lắng nghe dữ liệu cảm biến
        database.ref("/EcoFilter/sensorData").on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            let V = data.waterVolume ? parseFloat(data.waterVolume) : 0;
            let V_adc = data.turbidity ? parseFloat(data.turbidity) : 3.3;

            let M = alpha_coefficient * V;
            let satPercent = (M / M_MAX) * 100.0;
            if (satPercent > 100) satPercent = 100;

            if (satPercent >= 100.0 && !isRelayOff) {
                database.ref("/EcoFilter/relay/relayOff").set(true);
            }

            const now = Date.now();
            const dtMinutes = (now - lastTimestamp) / 60000.0;
            if (dtMinutes > 0 && M > lastPlasticMass && lastPlasticMass > 0) {
                let dM_dt = (M - lastPlasticMass) / dtMinutes;
                let f_turb = 3.3 / (V_adc + 0.1);
                let adjustedRate = dM_dt * f_turb;
                if (adjustedRate > 0) {
                    estimatedMinutesLeft = (M_MAX - M) / adjustedRate;
                }
            } else if (M >= M_MAX) {
                estimatedMinutesLeft = 0;
            }

            lastPlasticMass = M;
            lastTimestamp = now;

            updateUI(V, M, satPercent, estimatedMinutesLeft);
        });
    }

    function updateUI(V, M, satPercent, minsLeft) {
        document.getElementById("water-volume").textContent = V.toFixed(2);
        document.getElementById("plastic-mass").textContent = M.toFixed(2);
        document.getElementById("progress-percent").textContent = satPercent.toFixed(0);
        document.getElementById("filter-life").textContent = (100 - satPercent).toFixed(0);

        const satBar = document.getElementById("progress-fill");
        const satIcon = document.getElementById("sat-icon");
        if (satBar) {
            satBar.style.width = `${satPercent.toFixed(0)}%`;
            if (satPercent >= 80) { satBar.style.backgroundColor = "#ef4444"; if (satIcon) satIcon.textContent = "🔴"; }
            else if (satPercent >= 50) { satBar.style.backgroundColor = "#eab308"; if (satIcon) satIcon.textContent = "🟡"; }
            else { satBar.style.backgroundColor = "#22c55e"; if (satIcon) satIcon.textContent = "🟢"; }
        }

        const lifeEl = document.getElementById("filterLifeElement");
        if (lifeEl) {
            if (satPercent >= 100) { lifeEl.textContent = "CẢNH BÁO: Màng bão hòa - Bơm đã tự động ngắt!"; }
            else {
                let h = Math.floor(minsLeft / 60);
                let m = Math.round(minsLeft % 60);
                lifeEl.textContent = `Bảo trì sau: ${h} giờ ${m} phút`;
            }
        }

        if (realtimeChart) {
            let t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            realtimeChart.data.labels.push(t);
            realtimeChart.data.datasets[0].data.push(V);
            realtimeChart.data.datasets[1].data.push(M);
            if (realtimeChart.data.labels.length > 8) {
                realtimeChart.data.labels.shift();
                realtimeChart.data.datasets[0].data.shift();
                realtimeChart.data.datasets[1].data.shift();
            }
            realtimeChart.update();
        }
    }

    function initRealtimeChart() {
        const ctx = document.getElementById("realtimeChart");
        if (!ctx) return;
        realtimeChart = new Chart(ctx.getContext("2d"), {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    { label: "Nước V (L)", data: [], borderColor: "#0284c7", borderWidth: 2, pointRadius: 2, yAxisID: "y-water" },
                    { label: "Vi nhựa M (mg)", data: [], borderColor: "#ef4444", borderWidth: 2, pointRadius: 2, yAxisID: "y-plastic" }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { font: { size: 9 } } },
                    "y-water": { type: "linear", position: "left", ticks: { font: { size: 9 }, color: "#0284c7" } },
                    "y-plastic": { type: "linear", position: "right", ticks: { font: { size: 9 }, color: "#ef4444" }, grid: { display: false } }
                }
            }
        });
    }
})();

