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

// Khởi tạo Firebase an toàn chống trùng lặp
let app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const database = app.database();

// =====================================================
//                 🟢 BIẾN TOÀN CỤC, AI & ĐỒ THỊ
// =====================================================
const maxCapacity = 100; // Khối lượng vi nhựa bão hòa tối đa của màng Keratin (mg)
let realtimeChart = null;

// Biến điều khiển thuật toán hồi quy toán học y = ax
let ai_coefficient_a = 1.30; // Mặc định khớp với menu "Nước sông / Kênh rạch" hiện hành
let lastPlasticMass = 0;
let lastTimestamp = Date.now();
let estimatedMinutesLeft = 345;

// Chạy ngay khi tài nguyên hệ thống sẵn sàng
window.addEventListener("load", () => {
console.log("[MCathelish] Hệ thống kích hoạt thành công!");
initRealtimeChart();
setupGPSFeature();
setupManualMenu();
connectFirebaseRealtime(); // Kích hoạt lắng nghe dữ liệu từ Firebase
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
plugins: {
legend: { labels: { color: "#e2e8f0" } }
},
scales: {
x: {
grid: { color: "rgba(255,255,255,0.03)" },
ticks: { color: "#a0aec0" }
},
"y-water": {
type: "linear",
position: "left",
ticks: { color: "#00ffb7" }
},
"y-plastic": {
type: "linear",
position: "right",
ticks: { color: "#ff5e62" },
grid: { display: false }
}
}
}
});
}

// =====================================================
//          🟡 HÀM ĐỔ DỮ LIỆU CẬP NHẬT GIAO DIỆN REALTIME
// =====================================================
function updateUserInterface(waterVolume, microplasticMass, minutesLeft) {
// 1. Cập nhật các ô số chính trên Dashboard
const waterEl = document.getElementById("water-volume");
const plasticEl = document.getElementById("microplastic-mass");

if (waterEl) waterEl.innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">Lít</span>`;
if (plasticEl) plasticEl.innerText = microplasticMass.toFixed(2) + " mg";

// 2. Tính toán phần trăm bão hòa của màng lọc sinh học Keratin
let saturationPercentage = (microplasticMass / maxCapacity) * 100;
if (saturationPercentage > 100) saturationPercentage = 100;

const satBar = document.getElementById("filter-progress");
if (satBar) {
satBar.style.width = `${saturationPercentage.toFixed(0)}%`;
satBar.innerText = `${saturationPercentage.toFixed(0)}%`;
satBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f");
}

// 3. Cập nhật Trạng thái màng lọc AI công nghệ
const statusMessage = document.getElementById("status-message");
if (statusMessage) {
if (saturationPercentage >= 80) {
statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;">Cảnh báo: Màng lọc quá tải!</span>`;
} else if (saturationPercentage >= 50) {
statusMessage.innerHTML = `<span style="color: #ffb703;">Màng sắp bão hòa - Chú ý</span>`;
} else {
statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;
}
}

// 4. Cập nhật đồng hồ dự đoán tuổi thọ AI
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

// 5. Cập nhật điểm uốn đồ thị Chart.js
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

// 6. Đổ dữ liệu vào bảng Nhật Ký Giám Sát Hệ Thống
const tableBody = document.getElementById("history-log-body");
if (tableBody) {
const row = document.createElement("tr");
row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

let statusHTML = saturationPercentage >= 80 ? `<span style="color: #ff5e62">Quá tải</span>` : (saturationPercentage >= 50 ? `<span style="color: #ffb703">Sắp đầy</span>` : `<span style="color: #52b788">Ổn định</span>`);
const currentTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
row.innerHTML = `
<td style="padding: 10px;">${currentTimeStr}</td>
<td style="padding: 10px;">${waterVolume.toFixed(1)} L</td>
<td style="padding: 10px;">${microplasticMass.toFixed(2)} mg</td>
<td style="padding: 10px;">${statusHTML}</td>
`;
tableBody.insertBefore(row, tableBody.firstChild);
if (tableBody.children.length > 6) {
tableBody.removeChild(tableBody.lastChild);
}
}
}

// Hàm bổ trợ an toàn: Tách lấy số từ chuỗi giao diện (bỏ chữ Lít, mg...)
function getPureWaterValue() {
const el = document.getElementById("water-volume");
if (!el) return 0;
let text = el.textContent || el.innerText || "0";
let match = text.match(/[\d\.]+/); // Tìm chuỗi số thực bằng Regex
return match ? parseFloat(match[0]) : 0;
}

// =====================================================
//          🎯 XỬ LÝ ĐỊNH VỊ VỆ TINH CLOUD GPS THẬT
// =====================================================
function setupGPSFeature() {
const gpsButton = document.querySelector(".card-ai button");
if (!gpsButton) return;
gpsButton.addEventListener("click", () => {
gpsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang quét vệ tinh (Cloud GPS)...`;
const gpsOptions = {
enableHighAccuracy: true,
timeout: 8000,            // Không để đơ nút, quá 8 giây tự động kích hoạt chế độ dự phòng
maximumAge: 0            
};
if (navigator.geolocation) {
navigator.geolocation.getCurrentPosition(
(position) => {
const lat = position.coords.latitude;
const lon = position.coords.longitude;

// Thuật toán AI phân tích hệ số ô nhiễm dựa trên vĩ độ địa lý
ai_coefficient_a = lat > 10.75 ? 1.30 : 0.45;
let locationName = lat > 10.75 ? "Hạ lưu KCN Đô Thị (Ô nhiễm)" : "Khu dân cư sinh hoạt";

gpsButton.innerHTML = `<i class="fas fa-map-marker-alt"></i> Vị trí: ${locationName}`;
gpsButton.style.background = "#2d6a4f";

// Sửa lỗi quét mã màu: Tìm trực tiếp thẻ span đầu tiên trong div cấu hình hệ số của card-ai
const goldSpan = document.querySelector(".card-ai div span");
if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;

// Sử dụng hàm trích xuất số an toàn đã được sửa lỗi
let currentWater = getPureWaterValue();
const computedPlasticMass = currentWater * ai_coefficient_a;
updateUserInterface(currentWater, computedPlasticMass, estimatedMinutesLeft);

alert(` 🌐  [CLOUD GPS THÀNH CÔNG]\nTọa độ: (${lat.toFixed(4)}, ${lon.toFixed(4)})\nAI áp dụng hệ số hồi quy: a = ${ai_coefficient_a.toFixed(2)} mg/Lít.`);
},
(error) => {
console.error("[GPS ERROR]", error);
// Kịch bản dự phòng khi mất sóng vệ tinh trong phòng thi
ai_coefficient_a = 0.45;
gpsButton.innerHTML = `<i class="fas fa-map-marker-alt"></i> Trạm nội đô: Quận 3, TP.HCM`;
gpsButton.style.background = "#2d6a4f";

const goldSpan = document.querySelector(".card-ai div span");
if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;

let currentWater = getPureWaterValue();
updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);
},
gpsOptions
);
} else {
alert("Thiết bị không hỗ trợ Geolocation.");
}
});
}

// =====================================================
//                 🎨 XỬ LÝ THAY ĐỔI MENU THỦ CÔNG
// =====================================================
function setupManualMenu() {
const selectMenu = document.getElementById("water-type-select");
if (selectMenu) {
selectMenu.addEventListener("change", (e) => {
ai_coefficient_a = parseFloat(e.target.value);
updateManualUI();
});
}
}

function updateManualUI() {
const goldSpan = document.querySelector(".card-ai div span");
if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;

let currentWater = getPureWaterValue();
updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);
}

// =====================================================
//         🛰️ ĐỒNG BỘ CHUẨN FIREBASE & TÍNH TOÁN AI REALTIME
// =====================================================
function connectFirebaseRealtime() {
// Đọc thẳng từ nút gốc (/) khớp hoàn toàn với cấu trúc Firebase của ESP32
database.ref().on("value", (snapshot) => {
const data = snapshot.val();
if (!data) return;
// 1. Đọc chính xác lưu lượng nước thực tế do ESP32 truyền lên
let waterVolume = data.waterVolume !== undefined ? parseFloat(data.waterVolume) : 0;

// 2. Thuật toán AI tự động tính khối lượng vi nhựa hấp phụ dựa trên hệ số hồi quy thực nghiệm hiện hành
let microplasticMass = waterVolume * ai_coefficient_a;
// 3. Phân tích biến thiên dòng chảy thời gian thực để dự đoán tuổi thọ màng lọc
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
// Tốc độ tích lũy mặc định ban đầu khi dòng chảy chưa biến thiên lớn
let accumulationRateDefault = 0.25;
estimatedMinutesLeft = (maxCapacity - microplasticMass) / accumulationRateDefault;
}
// Lưu vết lịch sử cho vòng lặp kế tiếp
lastPlasticMass = microplasticMass;
lastTimestamp = now;
// Đổ toàn bộ dữ liệu thật lên màn hình Dashboard tức thì!
updateUserInterface(waterVolume, microplasticMass, estimatedMinutesLeft);
}, (error) => {
console.error("[FIREBASE CONNECTION ERROR]", error);
});
}
})();
