 // --- THUẬT TOÁN GIẢ LẬP IoT CHO DỰ ÁN ECOFILTER ---

let waterVolume = 0;       // Số lít nước chảy qua
let microplasticMass = 0;   // Khối lượng vi nhựa bẫy được (mg)
const maxCapacity = 100;    // Hạn mức tối đa màng lọc chịu được (mg)

// Cứ mỗi 1 giây (1000ms), giả lập số liệu tự động nhảy tăng lên
setInterval(() => {
    // 1. Giả lập mỗi giây có 0.2 Lít nước chảy qua cảm biến
    waterVolume += 0.2; 
    
    // 2. Giả lập hiệu suất bẫy: Nồng độ vi nhựa giữ lại là 0.5mg trên mỗi Lít nước
    microplasticMass = waterVolume * 0.5; 
    
    // 3. Tính toán % bão hòa của màng lọc Keratin
    let saturationPercentage = (microplasticMass / maxCapacity) * 100;
    if (saturationPercentage > 100) saturationPercentage = 100; // Khống chế tối đa 100%

    // 4. Cập nhật số liệu lên giao diện Web thời gian thực
    document.getElementById('water-volume').innerText = waterVolume.toFixed(1) + " Lít";
    document.getElementById('microplastic-mass').innerText = microplasticMass.toFixed(2) + " mg";
    
    // 5. Cập nhật độ dài và chữ hiển thị trên thanh tiến trình %
    const progressBar = document.getElementById('filter-progress');
    progressBar.style.width = saturationPercentage.toFixed(0) + "%";
    progressBar.innerText = saturationPercentage.toFixed(0) + "%";

    // 6. THUẬT TOÁN ĐIỀU KHIỂN & BÁO ĐỘNG ĐỎ
    if (saturationPercentage >= 80) {
        progressBar.style.backgroundColor = "#d90429"; // Đổi thanh tiến trình sang màu đỏ nguy hiểm
        document.getElementById('status-message').innerHTML = `
            <span class="blink">⚠️ NGUY HIỂM: Màng lọc bão hòa! Vui lòng thay màng ngay.</span>
        `;
    } else if (saturationPercentage >= 50) {
        progressBar.style.backgroundColor = "#e9c46a"; // Màu vàng cảnh báo sắp đầy
        document.getElementById('status-message').innerText = "Cảnh báo: Màng lọc bão hòa trên 50%.";
    } else {
        progressBar.style.backgroundColor = "#2d6a4f"; // Màu xanh hoạt động tốt
        document.getElementById('status-message').innerText = "Màng lọc hoạt động ổn định. An toàn.";
    }
}, 1000);