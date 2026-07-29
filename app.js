(function() {
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

    // ============================================================================
    // CƠ SỞ DỮ LIỆU GPS 15 ĐIỂM KHẢO SÁT CHUẨN (PHÂN 3 NHÓM HỆ SỐ THỰC NGHIỆM)
    // ============================================================================
    const SURVEY_LOCATIONS = [
        // NHÓM 1: CÔNG NGHIỆP (alpha = 1.30 mg/L)
        { code: "P1", name: "KCX Tân Thuận", lat: 10.748, lon: 106.726, group: "Công nghiệp", alpha: 1.30, ref: "Praveena et al. & UNEP (Tải lượng vi nhựa công nghiệp)" },
        { code: "P2", name: "KCN Hiệp Phước", lat: 10.660, lon: 106.742, group: "Công nghiệp", alpha: 1.30, ref: "Praveena et al. & UNEP (Tải lượng vi nhựa công nghiệp)" },
        { code: "P3", name: "KCN Tân Bình", lat: 10.801, lon: 106.639, group: "Công nghiệp", alpha: 1.30, ref: "Praveena et al. & UNEP (Tải lượng vi nhựa công nghiệp)" },
        { code: "P4", name: "Khu Công nghệ cao", lat: 10.854, lon: 106.790, group: "Công nghiệp", alpha: 1.30, ref: "Báo cáo quan trắc nước thải TP.HCM & UNEP" },

        // NHÓM 2: NƯỚC MẶT ĐÔ THỊ (alpha = 0.70 mg/L)
        { code: "P5", name: "Hồ Bán Nguyệt", lat: 10.729, lon: 106.722, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },
        { code: "P6", name: "Công viên Tao Đàn", lat: 10.776, lon: 106.691, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },
        { code: "P7", name: "Công viên Gia Định", lat: 10.812, lon: 106.678, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },
        { code: "P8", name: "Hồ Đá (ĐHQG)", lat: 10.878, lon: 106.802, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },
        { code: "P11", name: "TP. Thủ Đức", lat: 10.849, lon: 106.772, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },
        { code: "P13", name: "Gò Vấp", lat: 10.838, lon: 106.666, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },
        { code: "P14", name: "Tân Phú", lat: 10.792, lon: 106.628, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },
        { code: "P15", name: "Bình Thạnh", lat: 10.810, lon: 106.709, group: "Nước mặt đô thị", alpha: 0.70, ref: "Rügner et al. (2013) & Praveena et al. (2022)" },

        // NHÓM 3: SINH HOẠT (alpha = 0.45 mg/L)
        { code: "P9", name: "Bình Chánh", lat: 10.823, lon: 106.593, group: "Sinh hoạt", alpha: 0.45, ref: "Hannouche et al. (2011) & Praveena et al. (2022)" },
        { code: "P10", name: "Quận 12", lat: 10.868, lon: 106.640, group: "Sinh hoạt", alpha: 0.45, ref: "Hannouche et al. (2011) & Praveena et al. (2022)" },
        { code: "P12", name: "Phú Mỹ Hưng", lat: 10.728, lon: 106.715, group: "Sinh hoạt", alpha: 0.45, ref: "Hannouche et al. (2011) & Praveena et al. (2022)" }
    ];

    const M_MAX = 100.0;
    let alpha_coefficient = 0.45;
    let realtimeChart = null;
    let lastPlasticMass = 0;
    let lastTimestamp = Date.now();
    let estimatedMinutesLeft = 360;
    let isRelayOff = false;

    let dataLogs = [];

    window.addEventListener("load", () => {
        initRealtimeChart();
        setupGPSFeature();
        setupRelayManualControl();
        setupCSVExport();
        connectFirebaseRealtime();
    });

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
            btnGps.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang quét 15 điểm khảo sát...`;

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const uLat = position.coords.latitude;
                        const uLon = position.coords.longitude;

                        let minDist = Infinity;
                        let nearest = SURVEY_LOCATIONS[0];

                        SURVEY_LOCATIONS.forEach(loc => {
                            let d = calculateHaversineDistance(uLat, uLon, loc.lat, loc.lon);
                            if (d < minDist) { minDist = d; nearest = loc; }
                        });

                        alpha_coefficient = nearest.alpha;
                        database.ref("/alphaCoeff").set(alpha_coefficient);

                        btnGps.innerHTML = `<i class="fas fa-location-crosshairs"></i> Định vị GPS & Quét Điểm Khảo Sát`;
                        if (gpsInfo) gpsInfo.textContent = `Tọa độ: (${uLat.toFixed(3)}, ${uLon.toFixed(3)}) | Khớp điểm: ${nearest.code} (${minDist.toFixed(2)} km)`;

                        document.getElementById("waterSource").textContent = `${nearest.code} - ${nearest.name}`;
                        document.getElementById("alphaCoeffText").textContent = `Nhóm: ${nearest.group} | Hệ số α = ${nearest.alpha.toFixed(2)} mg/L`;
                        document.getElementById("sourceCitation").textContent = `Nguồn: ${nearest.ref}`;
                    },
                    (error) => {
                        alpha_coefficient = 0.45;
                        btnGps.innerHTML = `<i class="fas fa-location-crosshairs"></i> Định vị GPS & Quét Điểm Khảo Sát`;
                        if (gpsInfo) gpsInfo.textContent = `Lỗi GPS. Mặc định gán điểm P9 (Bình Chánh)`;
                    }
                );
            }
        });
    }

    function setupRelayManualControl() {
        const btnToggle = document.getElementById("btn-toggle-relay");
        if (!btnToggle) return;

        btnToggle.addEventListener("click", () => {
            isRelayOff = !isRelayOff;
            database.ref("/relayOff").set(isRelayOff);
        });
    }

    function setupCSVExport() {
        const btnExport = document.getElementById("btn-export-csv");
        if (!btnExport) return;

        btnExport.addEventListener("click", () => {
            if (dataLogs.length === 0) {
                alert("Chưa có dữ liệu lịch sử để xuất báo cáo!");
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,Thoi Gian,The Tich Water V (L),Vi Nhua M (mg),Bao Hoa S (%),He so Alpha (mg/L)\n";
            dataLogs.forEach(row => {
                csvContent += `${row.time},${row.v},${row.m},${row.sat},${row.alpha}\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `EcoFilter_Report_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    function connectFirebaseRealtime() {
        database.ref("/relayOff").on("value", (snapshot) => {
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

        database.ref("/").on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            let V = data.waterVolume ? parseFloat(data.waterVolume) : 0;
            let V_adc = data.turbidity ? parseFloat(data.turbidity) : 3.3;

            let M = alpha_coefficient * V;
            let satPercent = (M / M_MAX) * 100.0;
            if (satPercent > 100) satPercent = 100;

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

            let timeStr = new Date().toLocaleTimeString();
            dataLogs.push({ time: timeStr, v: V.toFixed(2), m: M.toFixed(2), sat: satPercent.toFixed(1), alpha: alpha_coefficient });

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
        const alertBox = document.getElementById("alert-box");

        if (satBar) {
            satBar.style.width = `${satPercent.toFixed(0)}%`;
            if (satPercent >= 80) {
                satBar.style.backgroundColor = "#ef4444";
                if (satIcon) satIcon.textContent = "🔴";
                if (alertBox) {
                    alertBox.className = "alert-banner alert-danger";
                    alertBox.innerHTML = `⚠️ CẢNH BÁO NGUY HIỂM: Màng lọc đã bão hòa ${satPercent.toFixed(0)}%! Cần thay màng lọc ngay.`;
                }
            } else if (satPercent >= 50) {
                satBar.style.backgroundColor = "#eab308";
                if (satIcon) satIcon.textContent = "🟡";
                if (alertBox) {
                    alertBox.className = "alert-banner alert-warning";
                    alertBox.innerHTML = `⚡ KHUYẾN CÁO: Màng lọc tích tụ vi nhựa ${satPercent.toFixed(0)}%. Chuẩn bị màng thay thế.`;
                }
            } else {
                satBar.style.backgroundColor = "#22c55e";
                if (satIcon) satIcon.textContent = "🟢";
                if (alertBox) alertBox.className = "alert-banner";
            }
        }

        const lifeEl = document.getElementById("filterLifeElement");
        if (lifeEl) {
            if (satPercent >= 100) { lifeEl.textContent = "CẦN THAY MÀNG LỌC - Máy bơm đã tự động ngắt!"; }
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



