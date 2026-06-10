// ==========================================
//  🔴  PHẦN CẤU HÌNH FIREBASE KẾT NỐI
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

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==========================================
//  🟢  BIẾN TOÀN CỤC & ĐỒ THỊ
// ==========================================
const maxCapacity = 100; // Ngưỡng khối lượng vi nhựa tối đa (mg)
const MAX_CAPACITY_LITERS = 5000; // Ngưỡng dung lượng nước tối đa của màng (Lít)

let realtimeChart;
let simulationInterval = null;
let currentWaterSimulation = 15.5;
let currentPlasticSimulation = 42.8;

// Biến lưu trữ số liệu cũ để tính lưu lượng tức thời (Flow Rate) cho AI
let lastWaterVolume = 0;
let lastTimestamp = Date.now();

document.addEventListener("DOMContentLoaded", () => {
const canvasElement = document.getElementById('realtimeChart');
if (!canvasElement) return;

const ctx = canvasElement.getContext('2d');
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
pointRadius: 2,
tension: 0.3,
yAxisID: 'yWater'
},
{
label: 'Vi nhựa giữ lại (mg)',
data: [],
borderColor: '#ff5e62',
backgroundColor: 'rgba(255, 94, 98, 0.05)',
borderWidth: 3,
pointRadius: 2,
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
yWater: {
type: 'linear', position: 'left',
title: { display: true, text: 'Lít', color: '#00ffb7', font: { weight: 'bold' } },
grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#a0aec0' }
},
yPlastic: {
type: 'linear', position: 'right',
title: { display: true, text: 'mg', color: '#ff5e62', font: { weight: 'bold' } },
grid: { display: false }, ticks: { color: '#a0aec0' }
}
},
plugins: { legend: { labels: { color: '#e2e8f0', font: { size: 12 } } } }
}
});
// BẮT ĐẦU CƠ CHẾ KIỂM TRA HYBRID TỰ ĐỘNG
initHybridSystem();
});

// ==========================================
//  🔄  KHỐI XỬ LÝ HYBRID (ONLINE / OFFLINE)
// ==========================================
function initHybridSystem() {
const connectedRef = database.ref(".info/connected");
connectedRef.on("value", (snap) => {
if (snap.val() === true) {
console.log("[HYBRID SYSTEM]  🌐  Đang chạy chế độ ONLINE (Đọc từ Firebase)");

if (simulationInterval) {
clearInterval(simulationInterval);
simulationInterval = null;
}

activateRealtimeDatabase();
} else {
console.log("[HYBRID SYSTEM]  🚨  MẤT MẠNG! Tự động chuyển sang chế độ OFFLINE BACKUP");

const statusMessage = document.getElementById('status-message');
if (statusMessage) {
statusMessage.innerHTML = `<span style="color: #ffb703; font-weight: bold;"> ⚠️  Đang chạy Chế độ Dự phòng (Offline Mode)</span>`;
}

activateOfflineSimulation();
}
});
}

// --- HÀM 1: ĐỌC DỮ LIỆU THẬT KHI CÓ MẠNG ---
function activateRealtimeDatabase() {
database.ref().on('value', (snapshot) => {
const data = snapshot.val();
if (!data) return;

let waterVolume = data.waterVolume || (data.Device_Data ? data.Device_Data.TotalWater : 0);
let microplasticMass = data.microplasticMass || (data.Device_Data ? data.Device_Data.Turbidity : 0);

updateUserInterface(waterVolume, microplasticMass);
});
}

// --- HÀM 2: TỰ KHỞI ĐỘNG GIẢ LẬP TẠI CHỖ KHI MẤT MẠNG ---
function activateOfflineSimulation() {
if (simulationInterval) return;

simulationInterval = setInterval(() => {
let waterInflow = 0.05 + Math.random() * 0.1;
currentWaterSimulation += waterInflow;

let plasticDetected = waterInflow * (2.5 + Math.random() * 0.4);
currentPlasticSimulation += plasticDetected;

updateUserInterface(currentWaterSimulation, currentPlasticSimulation);
}, 2000);
}

// --- HÀM 3: ĐỔ SỐ LIỆU LÊN GIAO DIỆN & TÍNH TOÁN AI ---
function updateUserInterface(waterVolume, microplasticMass) {
let saturationPercentage = (microplasticMass / maxCapacity) * 100;
if (saturationPercentage > 100) saturationPercentage = 100;

// Cập nhật các ô số liệu chính (Đã sửa ID chuẩn khớp với HTML mới)
if(document.getElementById('water-volume')) {
document.getElementById('water-volume').innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">Lít</span>`;
}
if(document.getElementById('microplastic-mass')) {
document.getElementById('microplastic-mass').innerText = microplasticMass.toFixed(2) + " mg";
}

// ----------------------------------------------------
// 🧠 THUẬT TOÁN AI DỰ ĐOÁN TUỔI THỌ MÀNG LỌC (MỚI)
// ----------------------------------------------------
let now = Date.now();
let timeDiffMinutes = (now - lastTimestamp) / 1000 / 60; // Quy đổi ra phút
let waterDiff = waterVolume - lastWaterVolume;

// Tính lưu lượng dòng chảy hiện tại (Lít/Phút)
let currentFlowRate = 0;
if (timeDiffMinutes > 0 && waterDiff >= 0) {
currentFlowRate = waterDiff / timeDiffMinutes;
}

// Lưu lại trạng thái để tính cho lần sau
lastWaterVolume = waterVolume;
lastTimestamp = now;

// Tính số lít nước màng lọc còn chịu đựng được
let litersRemaining = MAX_CAPACITY_LITERS - waterVolume;
if (litersRemaining < 0) litersRemaining = 0;

// Tính % tuổi thọ màng còn lại dựa trên lượng nước đã lọc
let lifespanPercent = Math.round((litersRemaining / MAX_CAPACITY_LITERS) * 100);

// Cập nhật đồng hồ đếm ngược tiên tri của AI
const aiCountdownElement = document.getElementById('ai-countdown');
if (aiCountdownElement) {
if (currentFlowRate > 0 && litersRemaining > 0) {
let totalMinutesRemaining = litersRemaining / currentFlowRate;
let hours = Math.floor(totalMinutesRemaining / 60);
let minutes = Math.round(totalMinutesRemaining % 60);
aiCountdownElement.innerText = `${hours} Giờ ${minutes} Phút`;
} else {
aiCountdownElement.innerText = "Hệ thống dừng...";
}
}

// Cập nhật nhãn trạng thái và màu sắc của AI
const aiStatusElement = document.getElementById('filter-status');
if (aiStatusElement) {
if (lifespanPercent > 50) {
aiStatusElement.innerText = `An toàn (${lifespanPercent}%)`;
aiStatusElement.className = "status-good";
} else if (lifespanPercent <= 50 && lifespanPercent > 15) {
aiStatusElement.innerText = `Chú ý (${lifespanPercent}%)`;
aiStatusElement.className = "status-warning";
} else {
aiStatusElement.innerText = `Sắp bão hòa! (${lifespanPercent}%)`;
aiStatusElement.className = "status-danger";
}
}
// ----------------------------------------------------

// Xử lý thanh tiến trình bão hòa vi nhựa và cảnh báo màu sắc
const progressBar = document.getElementById('filter-progress');
const statusMessage = document.getElementById('status-message');

if (progressBar && statusMessage) {
progressBar.style.width = saturationPercentage.toFixed(0) + "%";
progressBar.innerText = saturationPercentage.toFixed(0) + "%";

if (simulationInterval == null) {
if (saturationPercentage >= 80) {
progressBar.style.backgroundColor = "#ff5e62";
statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;"> 🚨  Cảnh báo: Màng lọc quá tải!</span>`;
} else if (saturationPercentage >= 50) {
progressBar.style.backgroundColor = "#ffb703";
statusMessage.innerHTML = `<span style="color: #ffb703;"> ⚠️  Cảnh báo: Màng lọc sắp đầy</span>`;
} else {
progressBar.style.backgroundColor = "#2d6a4f";
statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;
}
} else {
progressBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f");
}
}

// Cập nhật biểu đồ đường uốn lượn
if (realtimeChart) {
const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

realtimeChart.data.labels.push(currentTime);
realtimeChart.data.datasets[0].data.push(waterVolume);
realtimeChart.data.datasets[1].data.push(microplasticMass);

if (realtimeChart.data.labels.length > 12) {
realtimeChart.data.labels.shift();
realtimeChart.data.datasets[0].data.shift();
realtimeChart.data.datasets[1].data.shift();
}
realtimeChart.update('none');
}

// Tự động thêm dòng mới vào bảng nhật ký (Realtime logs)
const tableBody = document.getElementById("history-log-body");
if (tableBody) {
const row = document.createElement("tr");
row.style.borderBottom = "1px solid #2c3e50";

let statusHTML = `<span style="color: #52b788">Ổn định</span>`;
if (saturationPercentage >= 50 && saturationPercentage < 80) statusHTML = `<span style="color: #ffb703">Sắp đầy</span>`;
if (saturationPercentage >= 80) statusHTML = `<span style="color: #ff5e62; font-weight: bold;">Quá tải</span>`;

const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
row.innerHTML = `
<td style="padding: 10px;">${currentTime}</td>
<td style="padding: 10px;">${waterVolume.toFixed(1)} L</td>
<td style="padding: 10px;">${microplasticMass.toFixed(1)} mg</td>
<td style="padding: 10px;">${statusHTML}</td>
`;

tableBody.insertBefore(row, tableBody.firstChild);
if (tableBody.children.length > 8) {
tableBody.removeChild(tableBody.lastChild);
}
}
}

// Hàm hỗ trợ click nút bấm trên Web điều khiển bật/tắt bơm từ xa
function togglePump(status) {
database.ref('/Device_Control').update({
PumpStatus: status
});
}
