(function() {
// =====================================================
//                 🔴 KẾT NỐI FIREBASE IOT
// =====================================================
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

// =====================================================
//           🟢 HẰNG SỐ VÀ BIẾN MÔ HÌNH THỰC NGHIỆM
// =====================================================
const FILTER_MAX_CAPACITY = 100; // Sức chứa tối đa của màng (100 mg vi nhựa)
const GPS_LATITUDE_THRESHOLD = 10.75; // Ngưỡng phân loại tọa độ vùng khảo sát

let realtimeChart = null;
let empiricalCoefficient = 1.30; // Hệ số thực nghiệm mặc định (mg/L)
let lastPlasticMass = 0;
let lastTimestamp = Date.now();
let estimatedMinutesLeft = 345;

window.addEventListener("load", () => {
    console.log("[EcoFilter] Hệ thống giám sát kích hoạt thành công!");
    initRealtimeChart();
    setupGPSFeature();
    setupManualMenu();
    connectFirebaseRealtime();
});

// =====================================================
//           🔵 KHỞI TẠO ĐỒ THỊ REALTIME (CHART.JS)
// =====================================================
function initRealtimeChart() {
    const ctx = document.getElementById("realtimeChart");
    if (!ctx) return;
    realtimeChart = new Chart(ctx.getContext("2d"), {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "Lưu lượng nước tích lũy (Lít)",
                    data: [],
                    borderColor: "#00ffb7",
                    backgroundColor: "rgba(0, 255, 183, 0.05)",
                    borderWidth: 3,
                    pointRadius: 3,
                    yAxisID: "y-water",
                    tension: 0.3
                },
                {
                    label: "Vi nhựa giữ lại (mg)",
                    data: [],
                    borderColor: "#ff5e62",
                    backgroundColor: "rgba(255, 94, 98, 0.05)",
                    borderWidth: 3,
                    pointRadius: 3,
                    yAxisID: "y-plastic",
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#e2e8f0" } } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.03)" }, ticks: { color: "#a0aec0" } },
                "y-water": { type: "linear", position: "left", ticks: { color: "#00ffb7" } },
                "y-plastic": { type: "linear", position: "right", ticks: { color: "#ff5e62" }, grid: { display: false } }
            }
        }
    });
}

// =====================================================
//           🟡 CẬP NHẬT GIAO DIỆN VÀ MÔ HÌNH TOÁN HỌC
// =====================================================
function updateUserInterface(waterVolume, estimatedMicroplasticMass, minutesLeft) {
    const waterEl = document.getElementById("water-volume");
    const plasticEl = document.getElementById("plastic-mass");

    if (waterEl) waterEl.textContent = waterVolume.toFixed(2);
    if (plasticEl) plasticEl.textContent = estimatedMicroplasticMass.toFixed(2);

    let saturationPercentage = (estimatedMicroplasticMass / FILTER_MAX_CAPACITY) * 100;
    if (saturationPercentage > 100) saturationPercentage = 100;

    // Cập nhật % bão hòa
    const satPercentEl = document.getElementById("progress-percent");
    if (satPercentEl) satPercentEl.textContent = saturationPercentage.toFixed(0);

    // Cập nhật % tuổi thọ màng lọc
    const filterLifeValEl = document.getElementById("filter-life");
    if (filterLifeValEl) filterLifeValEl.textContent = (100 - saturationPercentage).toFixed(0);

    // Cập nhật thanh tiến trình (Progress bar)
    const satBar = document.getElementById("progress-fill");
    const satIcon = document.getElementById("sat-icon");
    if (satBar) {
        satBar.style.width = `${saturationPercentage.toFixed(0)}%`;
        
        if (saturationPercentage >= 80) {
            satBar.style.backgroundColor = "#ef4444";
            if (satIcon) satIcon.textContent = "🔴";
        } else if (saturationPercentage >= 50) {
            satBar.style.backgroundColor = "#eab308";
            if (satIcon) satIcon.textContent = "🟡";
        } else {
            satBar.style.backgroundColor = "#22c55e";
            if (satIcon) satIcon.textContent = "🟢";
        }
    }

    // Thời gian bảo trì từ Mô hình thực nghiệm
    const filterLifeElement = document.getElementById("filterLifeElement");
    if (filterLifeElement) {
        if (saturationPercentage >= 100) {
            filterLifeElement.textContent = "Yêu cầu thay màng lọc ngay!";
        } else {
            const hours = Math.floor(minutesLeft / 60);
            const mins = Math.round(minutesLeft % 60);
            filterLifeElement.textContent = `Bảo trì sau: ${hours} giờ ${mins} phút`;
        }
    }

    if (realtimeChart) {
        const currentTimeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        realtimeChart.data.labels.push(currentTimeLabel);
        realtimeChart.data.datasets[0].data.push(waterVolume);
        realtimeChart.data.datasets[1].data.push(estimatedMicroplasticMass);
        if (realtimeChart.data.labels.length > 10) {
            realtimeChart.data.labels.shift();
            realtimeChart.data.datasets[0].data.shift();
            realtimeChart.data.datasets[1].data.shift();
        }
        realtimeChart.update();
    }
}

function getPureWaterValue() {
    const el = document.getElementById("water-volume");
    if (!el) return 0;
    let text = el.textContent || "0";
    let match = text.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
}

// =====================================================
//           🎯 XỬ LÝ ĐỊNH VỊ TỰ ĐỘNG (AUTOMATIC GPS)
// =====================================================
function setupGPSFeature() {
    const gpsButton = document.getElementById("btn-gps");
    if (!gpsButton) return;
    gpsButton.addEventListener("click", () => {
        gpsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang xác định vị trí (Automatic GPS)...`;
        const gpsOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    empiricalCoefficient = lat > GPS_LATITUDE_THRESHOLD ? 1.30 : 0.45;
                    let locationName = lat > GPS_LATITUDE_THRESHOLD ? "Nguồn nước công nghiệp" : "Nguồn nước sinh hoạt";

                    gpsButton.innerHTML = `<i class="fas fa-crosshairs"></i> Tự động định vị (Automatic GPS)`;
                    
                    const regionEl = document.getElementById("waterSource");
                    if (regionEl) regionEl.textContent = locationName;

                    let currentWater = getPureWaterValue();
                    const estimatedMicroplasticMass = currentWater * empiricalCoefficient;
                    updateUserInterface(currentWater, estimatedMicroplasticMass, estimatedMinutesLeft);
                    
                    alert(`🌐 [AUTOMATIC GPS THÀNH CÔNG]\nTọa độ: (${lat.toFixed(4)}, ${lon.toFixed(4)})\nHệ số thực nghiệm áp dụng: a = ${empiricalCoefficient.toFixed(2)} mg/L.`);
                },
                (error) => {
                    empiricalCoefficient = 0.45;
                    gpsButton.innerHTML = `<i class="fas fa-crosshairs"></i> Tự động định vị (Automatic GPS)`;
                    const regionEl = document.getElementById("waterSource");
                    if (regionEl) regionEl.textContent = "Nguồn nước sinh hoạt";
                    
                    let currentWater = getPureWaterValue();
                    const estimatedMicroplasticMass = currentWater * empiricalCoefficient;
                    updateUserInterface(currentWater, estimatedMicroplasticMass, estimatedMinutesLeft);
                },
                gpsOptions
            );
        }
    });
}

// =====================================================
//           🎨 XỬ LÝ ĐIỀU CHỈNH MENU THỦ CÔNG
// =====================================================
function setupManualMenu() {
    const btn1 = document.getElementById("btn-manual-1");
    const btn2 = document.getElementById("btn-manual-2");
    const regionEl = document.getElementById("waterSource");

    if (btn1 && btn2) {
        btn1.addEventListener("click", () => {
            empiricalCoefficient = 1.30;
            if (regionEl) regionEl.textContent = "Nguồn nước công nghiệp";
            let currentWater = getPureWaterValue();
            const estimatedMicroplasticMass = currentWater * empiricalCoefficient;
            updateUserInterface(currentWater, estimatedMicroplasticMass, estimatedMinutesLeft);
        });

        btn2.addEventListener("click", () => {
            empiricalCoefficient = 0.45;
            if (regionEl) regionEl.textContent = "Nguồn nước sinh hoạt";
            let currentWater = getPureWaterValue();
            const estimatedMicroplasticMass = currentWater * empiricalCoefficient;
            updateUserInterface(currentWater, estimatedMicroplasticMass, estimatedMinutesLeft);
        });
    }
}

// =====================================================
//        🛰️ ĐỒNG BỘ FIREBASE REALTIME & TÍNH TOÁN DỰ BÁO
// =====================================================
function connectFirebaseRealtime() {
    database.ref("/").on("value", (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        let waterVolume = data.waterVolume !== undefined ? parseFloat(data.waterVolume) : 0;
        let turbidityVolt = data.turbidity !== undefined ? parseFloat(data.turbidity) : 3.3;
        
        // Mô hình tính toán khối lượng vi nhựa ước lượng
        const estimatedMicroplasticMass = waterVolume * empiricalCoefficient;
        
        const now = Date.now();
        const timePassedMinutes = (now - lastTimestamp) / 60000;

        // Mô hình thực nghiệm tính toán tốc độ suy giảm tuổi thọ màng
        if (timePassedMinutes > 0 && estimatedMicroplasticMass > lastPlasticMass && lastPlasticMass > 0) {
            let accumulationRate = (estimatedMicroplasticMass - lastPlasticMass) / timePassedMinutes;
            let turbidityFactor = (3.3 / (turbidityVolt + 0.1)); 
            let adjustedAccumulationRate = accumulationRate * turbidityFactor;

            let plasticRemaining = FILTER_MAX_CAPACITY - estimatedMicroplasticMass;
            if (plasticRemaining < 0) plasticRemaining = 0;
            
            if (adjustedAccumulationRate > 0) {
                estimatedMinutesLeft = plasticRemaining / adjustedAccumulationRate;
            }
        } else if (estimatedMicroplasticMass >= FILTER_MAX_CAPACITY) {
            estimatedMinutesLeft = 0;
        } else {
            let accumulationRateDefault = 0.25;
            estimatedMinutesLeft = (FILTER_MAX_CAPACITY - estimatedMicroplasticMass) / accumulationRateDefault;
        }
        
        lastPlasticMass = estimatedMicroplasticMass;
        lastTimestamp = now;
        
        updateUserInterface(waterVolume, estimatedMicroplasticMass, estimatedMinutesLeft);
    }, (error) => {
        console.error("[FIREBASE CONNECTION ERROR]", error);
    });
}
})();



