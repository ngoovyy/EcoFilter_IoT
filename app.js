(function() {
// =====================================================
//                 🔴 PHẦN CẤU HÌNH FIREBASE KẾT NỐI
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
//                 🟢 BIẾN TOÀN CỤC, AI & ĐỒ THỊ
// =====================================================
const maxCapacity = 100; 
let realtimeChart = null;

let ai_coefficient_a = 1.30; // Mặc định vùng ô nhiễm
let lastPlasticMass = 0;
let lastTimestamp = Date.now();
let estimatedMinutesLeft = 345;

window.addEventListener("load", () => {
    console.log("[MCathelish] Hệ thống kích hoạt thành công!");
    initRealtimeChart();
    setupGPSFeature();
    setupManualMenu(); // Khớp với 2 nút bấm thủ công mới
});

// =====================================================
//                 🔵 KHỞI TẠO ĐỒ THỊ REALTIME (CHART.JS)
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
//          🟡 HÀM ĐỔ DỮ LIỆU CẬP NHẬT GIAO DIỆN REALTIME
// =====================================================
function updateUserInterface(waterVolume, microplasticMass, minutesLeft) {
    // Đã sửa đổi khớp với index.html của Vy
    const waterEl = document.getElementById("water-volume");
    const plasticEl = document.getElementById("plastic-mass");

    if (waterEl) waterEl.innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">L</span>`;
    if (plasticEl) plasticEl.innerText = microplasticMass.toFixed(2);

    let saturationPercentage = (microplasticMass / maxCapacity) * 100;
    if (saturationPercentage > 100) saturationPercentage = 100;

    const satBar = document.getElementById("progress-fill");
    if (satBar) {
        satBar.style.width = `${saturationPercentage.toFixed(0)}%`;
        satBar.innerText = `${saturationPercentage.toFixed(0)}%`;
        satBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f");
    }

    const aiCountdownElement = document.getElementById("ai-countdown");
    if (aiCountdownElement) {
        if (saturationPercentage >= 100) {
            aiCountdownElement.innerText = "0 Giờ 0 Phút (Thay màng!)";
        } else {
            const hours = Math.floor(minutesLeft / 60);
            const mins = Math.round(minutesLeft % 60);
            aiCountdownElement.innerText = `${hours} Giờ ${mins} Phút`;
        }
    }

    if (realtimeChart) {
        const currentTimeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        realtimeChart.data.labels.push(currentTimeLabel);
        realtimeChart.data.datasets[0].data.push(waterVolume);
        realtimeChart.data.datasets[1].data.push(microplasticMass);
        if (realtimeChart.data.labels.length > 10) {
            realtimeChart.data.labels.shift();
            realtimeChart.data.datasets[0].data.shift();
            realtimeChart.data.datasets[1].data.shift();
        }
        realtimeChart.update();
    }

    const tableBody = document.querySelector(".history-table tbody");
    if (tableBody) {
        const row = document.createElement("tr");
        let badgeClass = saturationPercentage >= 80 ? "status-danger" : (saturationPercentage >= 50 ? "status-warn" : "status-good");
        let statusText = saturationPercentage >= 80 ? "Quá tải" : (saturationPercentage >= 50 ? "Sắp đầy" : "Ổn định");
        
        const currentTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        row.innerHTML = `
            <td>${currentTimeStr}</td>
            <td>${waterVolume.toFixed(1)} L</td>
            <td>${microplasticMass.toFixed(2)} mg</td>
            <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
        `;
        tableBody.insertBefore(row, tableBody.firstChild);
        if (tableBody.children.length > 6) {
            tableBody.removeChild(tableBody.lastChild);
        }
    }
}

function getPureWaterValue() {
    const el = document.getElementById("water-volume");
    if (!el) return 0;
    let text = el.textContent || el.innerText || "0";
    let match = text.match(/[\d\.]+/);
    return match ? parseFloat(match[0]) : 0;
}

// =====================================================
//          🎯 XỬ LÝ ĐỊNH VỊ VỆ TINH CLOUD GPS THẬT
// =====================================================
function setupGPSFeature() {
    const gpsButton = document.getElementById("btn-gps");
    if (!gpsButton) return;
    gpsButton.addEventListener("click", () => {
        gpsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang quét vệ tinh (Cloud GPS)...`;
        const gpsOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    ai_coefficient_a = lat > 10.75 ? 1.30 : 0.45;
                    let locationName = lat > 10.75 ? "Hạ lưu sông / Khu công nghiệp (1.30 mg/L)" : "Khu dân cư sinh hoạt / Nội đô (0.45 mg/L)";

                    gpsButton.innerHTML = `<i class="fas fa-crosshairs"></i> Tự động định vị (Cloud GPS)`;
                    
                    const regionEl = document.getElementById("current-region");
                    if (regionEl) regionEl.innerText = locationName;

                    // Bỏ chọn trạng thái active của menu thủ công khi dùng GPS để tránh xung đột trực quan
                    document.getElementById("btn-manual-1")?.classList.remove("active");
                    document.getElementById("btn-manual-2")?.classList.remove("active");

                    let currentWater = getPureWaterValue();
                    updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);
                    alert(`🌐 [CLOUD GPS THÀNH CÔNG]\nTọa độ: (${lat.toFixed(4)}, ${lon.toFixed(4)})\nAI áp dụng hệ số hồi quy: a = ${ai_coefficient_a.toFixed(2)} mg/L.`);
                },
                (error) => {
                    ai_coefficient_a = 0.45;
                    gpsButton.innerHTML = `<i class="fas fa-crosshairs"></i> Tự động định vị (Cloud GPS)`;
                    const regionEl = document.getElementById("current-region");
                    if (regionEl) regionEl.innerText = "Trạm nội đô: Quận 3, TP.HCM (0.45 mg/L)";
                    
                    let currentWater = getPureWaterValue();
                    updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);
                },
                gpsOptions
            );
        }
    });
}

// =====================================================
//                 🎨 XỬ LÝ THAY ĐỔI MENU THỦ CÔNG
// =====================================================
function setupManualMenu() {
    const btn1 = document.getElementById("btn-manual-1");
    const btn2 = document.getElementById("btn-manual-2");
    const regionEl = document.getElementById("current-region");

    if (btn1 && btn2) {
        btn1.addEventListener("click", () => {
            ai_coefficient_a = 1.30;
            btn1.classList.add("active");
            btn2.classList.remove("active");
            if (regionEl) regionEl.innerText = "Hạ lưu sông / Khu công nghiệp (1.30 mg/L)";
            let currentWater = getPureWaterValue();
            updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);
        });

        btn2.addEventListener("click", () => {
            ai_coefficient_a = 0.45;
            btn2.classList.add("active");
            btn1.classList.remove("active");
            if (regionEl) regionEl.innerText = "Khu dân cư sinh hoạt / Nội đô (0.45 mg/L)";
            let currentWater = getPureWaterValue();
            updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);
        });
    }
}

// =====================================================
//         🛰️ ĐỒNG BỘ CHUẨN FIREBASE & TÍNH TOÁN AI REALTIME
// =====================================================
function connectFirebaseRealtime() {
    database.ref().on("value", (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        let waterVolume = data.waterVolume !== undefined ? parseFloat(data.waterVolume) : 0;
        let microplasticMass = waterVolume * ai_coefficient_a;
        
        const now = Date.now();
        const timePassedMinutes = (now - lastTimestamp) / 60000;

        if (timePassedMinutes > 0 && microplasticMass > lastPlasticMass && lastPlasticMass > 0) {
            let accumulationRate = (microplasticMass - lastPlasticMass) / timePassedMinutes;
            let plasticRemaining = maxCapacity - microplasticMass;
            if (plasticRemaining < 0) plasticRemaining = 0;
            if (accumulationRate > 0) {
                estimatedMinutesLeft = plasticRemaining / accumulationRate;
            }
        } else if (microplasticMass >= maxCapacity) {
            estimatedMinutesLeft = 0;
        } else {
            let accumulationRateDefault = 0.25;
            estimatedMinutesLeft = (maxCapacity - microplasticMass) / accumulationRateDefault;
        }
        
        lastPlasticMass = microplasticMass;
        lastTimestamp = now;
        updateUserInterface(waterVolume, microplasticMass, estimatedMinutesLeft);
    }, (error) => {
        console.error("[FIREBASE CONNECTION ERROR]", error);
    });
}
})();

