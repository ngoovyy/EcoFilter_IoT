// --- KHỞI TẠO BIẾN GIẢ LẬP BAN ĐẦU ---
let waterVolume = 0;          // Bắt đầu từ 0 Lít nước
let microplasticMass = 0;     // Bắt đầu từ 0 mg vi nhựa
const maxCapacity = 100;      // Hạn mức tối đa màng lọc chịu được (100mg)

// --- 1. CẤU HÌNH BIỂU ĐỒ CHART.JS ---
const ctx = document.getElementById('realtimeChart').getContext('2d');
const realtimeChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [], // Trục X: Chứa mốc thời gian nhảy số (Giây)
        datasets: [
            {
                label: 'Lưu lượng nước (Lít)',
                data: [],
                borderColor: '#00ffb7', // Xanh Neon
                backgroundColor: 'rgba(0, 255, 183, 0.05)',
                borderWidth: 3,
                pointRadius: 2,
                tension: 0.3, // Làm mượt đường cong đồ thị
                yAxisID: 'yWater'
            },
            {
                label: 'Vi nhựa giữ lại (mg)',
                data: [],
                borderColor: '#ff5e62', // Hồng Đỏ
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
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.03)' },
                ticks: { color: '#a0aec0' }
            },
            yWater: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'Lít', color: '#00ffb7', font: { weight: 'bold' } },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#a0aec0' }
            },
            yPlastic: {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'mg', color: '#ff5e62', font: { weight: 'bold' } },
                grid: { display: false }, // Tắt lưới bên phải để tránh rối mắt
                ticks: { color: '#a0aec0' }
            }
        },
        plugins: {
            legend: {
                labels: { color: '#e2e8f0', font: { size: 12 } }
            }
        }
    }
});

// --- 2. HÀM CHẠY ĐỒNG BỘ MỖI 1 GIÂY ---
setInterval(() => {
    // a. Giả lập nước chảy: Mỗi giây tăng 0.2 Lít
    waterVolume += 0.2;
    
    // b. Giả lập hiệu suất bẫy: Cứ 1 Lít nước thu được 0.5mg vi nhựa
    microplasticMass = waterVolume * 0.5;

    // c. Tính toán phần trăm độ bão hòa của màng
    let saturationPercentage = (microplasticMass / maxCapacity) * 100;
    if (saturationPercentage > 100) saturationPercentage = 100;

    // d. Cập nhật các con số lên giao diện Kính Mờ
    document.getElementById('water-volume').innerText = waterVolume.toFixed(1) + " Lít";
    document.getElementById('microplastic-mass').innerText = microplasticMass.toFixed(2) + " mg";

    // e. Xử lý thanh tiến trình tiến độ bão hòa và đổi màu cảnh báo
    const progressBar = document.getElementById('filter-progress');
    const statusMessage = document.getElementById('status-message');
    
    progressBar.style.width = saturationPercentage.toFixed(0) + "%";
    progressBar.innerText = saturationPercentage.toFixed(0) + "%";

    if (saturationPercentage >= 80) {
        progressBar.style.backgroundColor = "#ff5e62"; // Đỏ nguy hiểm
        statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;">⚠️ NGUY HIỂM: Màng bão hòa! Hãy thay thế!</span>`;
    } else if (saturationPercentage >= 50) {
        progressBar.style.backgroundColor = "#ffb703"; // Vàng cảnh báo sắp đầy
        statusMessage.innerHTML = `<span style="color: #ffb703;">⚠️ Cảnh báo: Màng lọc sắp đầy</span>`;
    } else {
        progressBar.style.backgroundColor = "#2d6a4f"; // Xanh lục hoạt động tốt
        statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;
    }

    // f. CẬP NHẬT BIỂU ĐỒ THEO THỜI GIAN THỰC
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    realtimeChart.data.labels.push(currentTime);
    realtimeChart.data.datasets[0].data.push(waterVolume);
    realtimeChart.data.datasets[1].data.push(microplasticMass);

    // Giữ biểu đồ luôn đẹp mắt: Nếu quá 12 điểm dữ liệu, tự dịch chuyển tịnh tiến sang phải
    if (realtimeChart.data.labels.length > 12) {
        realtimeChart.data.labels.shift();
        realtimeChart.data.datasets[0].data.shift();
        realtimeChart.data.datasets[1].data.shift();
    }

    // Lệnh kích hoạt biểu đồ vẽ lại đường mới
    realtimeChart.update('none'); // Thêm tham số 'none' để biểu đồ mượt, không bị khựng giật

}, 1000); // 1000ms = 1 giây chạy một lần
