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
const maxCapacity = 100; // Ngưỡng khối lượng vi nhựa tối đa (mg) [cite: 223]
const MAX_CAPACITY_LITERS = 5000; // Ngưỡng dung lượng nước tối đa của màng (Lít) [cite: 224]

let realtimeChart; // [cite: 225]
let simulationInterval = null; // [cite: 226]
let currentWaterSimulation = 15.5; // [cite: 227]
let currentPlasticSimulation = 42.8; // [cite: 228]

// Biến lưu trữ số liệu cũ để tính tốc độ bám vi nhựa (Plastic Accumulation Rate) cho AI
let lastPlasticMass = 42.8;
let lastTimestamp = Date.now(); // [cite: 231]

document.addEventListener("DOMContentLoaded", () => { // [cite: 232]
  const canvasElement = document.getElementById('realtimeChart'); // [cite: 233]
  if (!canvasElement) return; // [cite: 234]

  const ctx = canvasElement.getContext('2d'); // [cite: 235]
  realtimeChart = new Chart(ctx, { // [cite: 236]
    type: 'line', // [cite: 237]
    data: { // [cite: 238]
      labels: [], // [cite: 239]
      datasets: [ // [cite: 240]
        {
          label: 'Lưu lượng nước (Lít)', // [cite: 242]
          data: [], // [cite: 243]
          borderColor: '#00ffb7', // [cite: 244]
          backgroundColor: 'rgba(0, 255, 183, 0.05)', // [cite: 245]
          borderWidth: 3, // [cite: 246]
          pointRadius: 2, // [cite: 247]
          tension: 0.3, // [cite: 248]
          yAxisID: 'yWater' // [cite: 249]
        },
        {
          label: 'Vi nhựa giữ lại (mg)', // [cite: 252]
          data: [], // [cite: 253]
          borderColor: '#ff5e62', // [cite: 254]
          backgroundColor: 'rgba(255, 94, 98, 0.05)', // [cite: 255]
          borderWidth: 3, // [cite: 256]
          pointRadius: 2, // [cite: 257]
          tension: 0.3, // [cite: 258]
          yAxisID: 'yPlastic' // [cite: 259]
        }
      ]
    },
    options: { // [cite: 263]
      responsive: true, // [cite: 264]
      maintainAspectRatio: false, // [cite: 265]
      scales: { // [cite: 266]
        x: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#a0aec0' } }, // [cite: 267]
        yWater: { // [cite: 268]
          type: 'linear', position: 'left', // [cite: 269]
          title: { display: true, text: 'Lít', color: '#00ffb7', font: { weight: 'bold' } }, // [cite: 270]
          grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#a0aec0' } // [cite: 271]
        },
        yPlastic: { // [cite: 273]
          type: 'linear', position: 'right', // [cite: 274]
          title: { display: true, text: 'mg', color: '#ff5e62', font: { weight: 'bold' } }, // [cite: 275]
          grid: { display: false }, ticks: { color: '#a0aec0' } // [cite: 276]
        }
      },
      plugins: { legend: { labels: { color: '#e2e8f0', font: { size: 12 } } } } // [cite: 279]
    }
  });
  // BẮT ĐẦU CƠ CHẾ KIỂM TRA HYBRID TỰ ĐỘNG
  initHybridSystem(); // [cite: 283]
});

// ==========================================
//  🔄  KHỐI XỬ LÝ HYBRID (ONLINE / OFFLINE)
// ==========================================
function initHybridSystem() { // [cite: 288]
  const connectedRef = database.ref(".info/connected"); // [cite: 289]
  connectedRef.on("value", (snap) => { // [cite: 290]
    if (snap.val() === true) { // [cite: 291]
      console.log("[HYBRID SYSTEM]   🌐   Đang chạy chế độ ONLINE (Đọc từ Firebase)"); // [cite: 292]
      if (simulationInterval) { // [cite: 293]
        clearInterval(simulationInterval); // [cite: 294]
        simulationInterval = null; // [cite: 295]
      }
      activateRealtimeDatabase(); // [cite: 297]
    } else { // [cite: 298]
      console.log("[HYBRID SYSTEM]   🚨   MẤT MẠNG! Tự động chuyển sang chế độ OFFLINE BACKUP"); // [cite: 299]
      const statusMessage = document.getElementById('status-message'); // [cite: 300]
      if (statusMessage) { // [cite: 301]
        statusMessage.innerHTML = `<span style="color: #ffb703; font-weight: bold;">  ⚠️   Đang chạy Chế độ Dự phòng (Offline Mode)</span>`; // [cite: 302]
      }
      activateOfflineSimulation(); // [cite: 304]
    }
  });
}

// --- HÀM 1: ĐỌC DỮ LIỆU THẬT KHI CÓ MẠNG ---
function activateRealtimeDatabase() { // [cite: 309]
  database.ref().on('value', (snapshot) => { // [cite: 310]
    const data = snapshot.val(); // [cite: 311]
    if (!data) return; // [cite: 312]
    let waterVolume = data.waterVolume || (data.Device_Data ? data.Device_Data.TotalWater : 0); // [cite: 313]
    let microplasticMass = data.microplasticMass || (data.Device_Data ? data.Device_Data.Turbidity : 0); // [cite: 314]
    updateUserInterface(waterVolume, microplasticMass); // [cite: 315]
  });
}

// --- HÀM 2: TỰ KHỞI ĐỘNG GIẢ LẬP TẠI CHỖ KHI MẤT MẠNG ---
function activateOfflineSimulation() { // [cite: 319]
  if (simulationInterval) return; // [cite: 320]
  simulationInterval = setInterval(() => { // [cite: 321]
    let waterInflow = 0.05 + Math.random() * 0.1; // [cite: 322]
    currentWaterSimulation += waterInflow; // [cite: 323]
    let plasticDetected = waterInflow * (1.5 + Math.random() * 0.3); // Tinh chỉnh lại để tốc độ tăng thực tế hơn
    currentPlasticSimulation += plasticDetected; // [cite: 325]
    updateUserInterface(currentWaterSimulation, currentPlasticSimulation); // [cite: 326]
  }, 2000); // [cite: 327]
}

// --- HÀM 3: ĐỔ SỐ LIỆU LÊN GIAO DIỆN & TÍNH TOÁN AI ---
function updateUserInterface(waterVolume, microplasticMass) { // [cite: 329]
  let saturationPercentage = (microplasticMass / maxCapacity) * 100; // 
  if (saturationPercentage > 100) saturationPercentage = 100; // [cite: 332]

  // Cập nhật các ô số liệu chính
  if(document.getElementById('water-volume')) { // [cite: 334]
    document.getElementById('water-volume').innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">Lít</span>`; // [cite: 335]
  }
  if(document.getElementById('microplastic-mass')) { // [cite: 337]
    document.getElementById('microplastic-mass').innerText = microplasticMass.toFixed(2) + " mg"; // [cite: 338]
  }

  // ----------------------------------------------------
  //  🧠  THUẬT TOÁN AI DỰ ĐOÁN TUỔI THỌ MÀNG LỌC (CẬP NHẬT)
  // ----------------------------------------------------
  let now = Date.now(); // [cite: 343]
  let timeDiffSeconds = (now - lastTimestamp) / 1000; // Tính theo giây để nhạy dữ liệu hơn
  let plasticDiff = microplasticMass - lastPlasticMass;

  // Tính tốc độ tích tụ vi nhựa thực tế (mg/giây)
  // Nếu dữ liệu đứng im hoặc mới khởi chạy, áp dụng tốc độ cơ sở an toàn là 0.005 mg/s
  let currentPlasticRate = 0.005; 
  if (timeDiffSeconds > 0 && plasticDiff > 0) {
    currentPlasticRate = plasticDiff / timeDiffSeconds;
  }

  // Lưu lại mốc trạng thái để tính toán cho chu kỳ kế tiếp
  lastPlasticMass = microplasticMass;
  lastTimestamp = now;

  // Tính toán khối lượng vi nhựa màng sinh học Keratin còn chịu đựng được
  let plasticRemaining = maxCapacity - microplasticMass;
  if (plasticRemaining < 0) plasticRemaining = 0;

  // Ước tính phần trăm tuổi thọ an toàn còn lại của màng
  let lifespanPercent = Math.round((plasticRemaining / maxCapacity) * 100);

  // Đổ kết quả đếm ngược ra đồng hồ tiên tri AI
  const aiCountdownElement = document.getElementById('ai-countdown'); // [cite: 360]
  if (aiCountdownElement) {
    if (plasticRemaining > 0) {
      let totalSecondsRemaining = plasticRemaining / currentPlasticRate;
      let totalMinutesRemaining = totalSecondsRemaining / 60;
      
      let hours = Math.floor(totalMinutesRemaining / 60);
      let minutes = Math.round(totalMinutesRemaining % 60);
      
      // Nếu tính ra 0 giờ 0 phút do dữ liệu nhảy vọt, ghim tối thiểu 1 phút để tránh lỗi hiển thị
      if (hours === 0 && minutes === 0) minutes = 1;

      aiCountdownElement.innerText = `${hours} Giờ ${minutes} Phút`;
    } else {
      aiCountdownElement.innerText = "0 Giờ 0 Phút";
    }
  }

  // Cập nhật nhãn trạng thái trực quan và màu sắc tương ứng cho khối AI
  const aiStatusElement = document.getElementById('filter-status'); // [cite: 372]
  if (aiStatusElement) { // [cite: 373]
    if (lifespanPercent > 50) { // [cite: 374]
      aiStatusElement.innerText = `An toàn (${lifespanPercent}%)`; // [cite: 375]
      aiStatusElement.className = "status-good"; // [cite: 376]
    } else if (lifespanPercent <= 50 && lifespanPercent > 15) { // [cite: 377]
      aiStatusElement.innerText = `Chú ý (${lifespanPercent}%)`; // [cite: 378]
      aiStatusElement.className = "status-warning"; // [cite: 379]
    } else { // [cite: 380]
      aiStatusElement.innerText = `Sắp bão hòa! (${lifespanPercent}%)`; // [cite: 381]
      aiStatusElement.className = "status-danger"; // [cite: 382]
    }
  }
  // ----------------------------------------------------

  // Xử lý thanh tiến trình bão hòa vi nhựa và cảnh báo màu sắc
  const progressBar = document.getElementById('filter-progress'); // [cite: 387]
  const statusMessage = document.getElementById('status-message'); // [cite: 388]
  if (progressBar && statusMessage) { // [cite: 389]
    progressBar.style.width = saturationPercentage.toFixed(0) + "%"; // [cite: 390]
    progressBar.innerText = saturationPercentage.toFixed(0) + "%"; // [cite: 391]
    if (simulationInterval == null) { // [cite: 392]
      if (saturationPercentage >= 80) { // [cite: 393]
        progressBar.style.backgroundColor = "#ff5e62"; // [cite: 394]
        statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;">  🚨   Cảnh báo: Màng lọc quá tải!</span>`; // [cite: 395]
      } else if (saturationPercentage >= 50) { // [cite: 396]
        progressBar.style.backgroundColor = "#ffb703"; // [cite: 397]
        statusMessage.innerHTML = `<span style="color: #ffb703;">  ⚠️   Cảnh báo: Màng lọc sắp đầy</span>`; // [cite: 398]
      } else { // [cite: 399]
        progressBar.style.backgroundColor = "#2d6a4f"; // [cite: 400]
        statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`; // [cite: 401]
      }
    } else { // [cite: 403]
      progressBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f"); // [cite: 404]
    }
  }

  // Cập nhật biểu đồ đường uốn lượn
  if (realtimeChart) { // [cite: 408]
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); // [cite: 409]
    realtimeChart.data.labels.push(currentTime); // [cite: 410]
    realtimeChart.data.datasets[0].data.push(waterVolume); // [cite: 411]
    realtimeChart.data.datasets[1].data.push(microplasticMass); // [cite: 412]
    if (realtimeChart.data.labels.length > 12) { // [cite: 413]
      realtimeChart.data.labels.shift(); // [cite: 414]
      realtimeChart.data.datasets[0].data.shift(); // [cite: 415]
      realtimeChart.data.datasets[1].data.shift(); // [cite: 416]
    }
    realtimeChart.update('none'); // [cite: 418]
  }

  // Tự động thêm dòng mới vào bảng nhật ký (Realtime logs)
  const tableBody = document.getElementById("history-log-body"); // [cite: 421]
  if (tableBody) { // [cite: 422]
    const row = document.createElement("tr"); // [cite: 423]
    row.style.borderBottom = "1px solid #2c3e50"; // [cite: 424]
    let statusHTML = `<span style="color: #52b788">Ổn định</span>`; // [cite: 425]
    if (saturationPercentage >= 50 && saturationPercentage < 80) statusHTML = `<span style="color: #ffb703">Sắp đầy</span>`; // [cite: 426]
    if (saturationPercentage >= 80) statusHTML = `<span style="color: #ff5e62; font-weight: bold;">Quá tải</span>`; // [cite: 427]
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); // [cite: 428]
    row.innerHTML = `
      <td style="padding: 10px;">${currentTime}</td>
      <td style="padding: 10px;">${waterVolume.toFixed(1)} L</td>
      <td style="padding: 10px;">${microplasticMass.toFixed(1)} mg</td>
      <td style="padding: 10px;">${statusHTML}</td>
    `; // [cite: 429]
    tableBody.insertBefore(row, tableBody.firstChild); // [cite: 435]
    if (tableBody.children.length > 8) { // [cite: 436]
      tableBody.removeChild(tableBody.lastChild); // [cite: 437]
    }
  }
}

// Hàm hỗ trợ click nút bấm trên Web điều khiển bật/tắt bơm từ xa
function togglePump(status) { // [cite: 441]
  database.ref('/Device_Control').update({ // [cite: 442]
    PumpStatus: status // [cite: 444]
  });
}
