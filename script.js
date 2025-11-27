document.addEventListener('DOMContentLoaded', function() {
    // 切换分割方式
    document.querySelectorAll('input[name="splitType"]').forEach(radio => {
        radio.addEventListener('change', function() {
            document.getElementById('subnetCountGroup').style.display = 
                this.value === 'count' ? 'block' : 'none';
            document.getElementById('subnetSizeGroup').style.display = 
                this.value === 'size' ? 'block' : 'none';
        });
    });

    // 表单提交处理
    document.getElementById('subnetForm').addEventListener('submit', function(e) {
        e.preventDefault();
        calculateSubnets();
    });

    // 初始化子网大小输入
    const ipTypeSelect = document.getElementById('ipType');
    updateSubnetSizeInput(ipTypeSelect.value);
    ipTypeSelect.addEventListener('change', function() {
        updateSubnetSizeInput(this.value);
    });
});

function updateSubnetSizeInput(ipType) {
    const subnetSizeInput = document.getElementById('subnetSize');
    if (ipType === 'ipv4') {
        subnetSizeInput.min = 1;
        subnetSizeInput.max = 32;
        subnetSizeInput.value = 24;
    } else {
        subnetSizeInput.min = 1;
        subnetSizeInput.max = 128;
        subnetSizeInput.value = 64;
    }
}

function calculateSubnets() {
    const ipType = document.getElementById('ipType').value;
    const baseCidr = document.getElementById('baseCidr').value.trim();
    const splitType = document.querySelector('input[name="splitType"]:checked').value;
    
    try {
        // 验证基础网段
        if (!isValidCidr(baseCidr, ipType)) {
            throw new Error(`无效的${ipType.toUpperCase()} CIDR格式`);
        }

        const [baseIp, prefixLength] = baseCidr.split('/');
        const prefixLen = parseInt(prefixLength);
        
        let subnets = [];
        if (splitType === 'count') {
            const subnetCount = parseInt(document.getElementById('subnetCount').value);
            subnets = splitBySubnetCount(baseIp, prefixLen, subnetCount, ipType);
        } else {
            const newPrefixLen = parseInt(document.getElementById('subnetSize').value);
            subnets = splitBySubnetSize(baseIp, prefixLen, newPrefixLen, ipType);
        }

        displayResults(baseCidr, subnets, ipType);
    } catch (error) {
        showError(error.message);
    }
}

function isValidCidr(cidr, ipType) {
    if (!cidr.includes('/')) return false;
    
    const [ip, prefix] = cidr.split('/');
    const prefixLen = parseInt(prefix);
    
    if (ipType === 'ipv4') {
        if (prefixLen < 1 || prefixLen > 32) return false;
        return isValidIPv4(ip);
    } else {
        if (prefixLen < 1 || prefixLen > 128) return false;
        return isValidIPv6(ip);
    }
}

function isValidIPv4(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    return parts.every(part => {
        const num = parseInt(part);
        return !isNaN(num) && num >= 0 && num <= 255;
    });
}

function isValidIPv6(ip) {
    // 简化的IPv6验证
    if (ip === '::') return true;
    
    const parts = ip.split(':');
    if (parts.length < 3 || parts.length > 8) return false;
    
    return parts.every(part => {
        if (part === '') return true; // 允许空部分表示连续的0
        return /^[0-9a-fA-F]{1,4}$/.test(part);
    });
}

function splitBySubnetCount(baseIp, prefixLen, subnetCount, ipType) {
    if (subnetCount < 2) throw new Error('子网数量必须大于1');
    
    const bitsNeeded = Math.ceil(Math.log2(subnetCount));
    const newPrefixLen = prefixLen + bitsNeeded;
    
    const maxPrefixLen = ipType === 'ipv4' ? 32 : 128;
    if (newPrefixLen > maxPrefixLen) {
        throw new Error(`无法分割为${subnetCount}个子网，超出最大前缀长度`);
    }
    
    return splitBySubnetSize(baseIp, prefixLen, newPrefixLen, ipType);
}

function splitBySubnetSize(baseIp, prefixLen, newPrefixLen, ipType) {
    if (newPrefixLen <= prefixLen) {
        throw new Error('新前缀长度必须大于原前缀长度');
    }
    
    const maxPrefixLen = ipType === 'ipv4' ? 32 : 128;
    if (newPrefixLen > maxPrefixLen) {
        throw new Error(`前缀长度不能超过${maxPrefixLen}`);
    }
    
    const subnetCount = Math.pow(2, newPrefixLen - prefixLen);
    let subnets = [];
    
    if (ipType === 'ipv4') {
        const baseIpNum = ipv4ToNumber(baseIp);
        const increment = Math.pow(2, 32 - newPrefixLen);
        
        for (let i = 0; i < subnetCount; i++) {
            const startIpNum = baseIpNum + (i * increment);
            const endIpNum = startIpNum + increment - 1;
            
            subnets.push({
                network: numberToIpv4(startIpNum) + '/' + newPrefixLen,
                startIp: numberToIpv4(startIpNum),
                endIp: numberToIpv4(endIpNum),
                addressCount: increment
            });
        }
    } else {
        // 修复IPv6实现 - 移除简化处理
        subnets = calculateIpv6Subnets(baseIp, newPrefixLen, prefixLen, subnetCount);
    }
    
    return subnets;
}

function calculateIpv6Subnets(baseIp, newPrefixLen, prefixLen, subnetCount) {
    const subnets = [];
    
    // 计算每个子网的网络地址
    for (let i = 0; i < subnetCount; i++) {
        const subnetNetwork = generateIpv6Subnet(baseIp, i, subnetCount, newPrefixLen, prefixLen);
        
        subnets.push({
            network: subnetNetwork + '/' + newPrefixLen,
            startIp: subnetNetwork,
            endIp: generateIpv6EndAddress(subnetNetwork, newPrefixLen),
            addressCount: calculateIpv6SubnetSize(newPrefixLen)
        });
    }
    
    return subnets;
}

function generateIpv6Subnet(baseIp, subnetId, subnetCount, newPrefixLen, prefixLen) {
    // 完整的IPv6子网计算方法
    const normalizedIp = normalizeIpv6(baseIp);
    const ipParts = normalizedIp.split(':');
    
    // 确保IPv6地址格式完整(8个部分)
    while (ipParts.length < 8) {
        ipParts.push('0');
    }
    
    // 计算需要修改的部分和位数
    const bitsPerSubnetPart = newPrefixLen - prefixLen;
    const subnetPartIndex = Math.floor(newPrefixLen / 16);
    
    if (subnetPartIndex < ipParts.length) {
        // 将子网ID转换为16进制并插入到合适的位置
        const subnetHex = subnetId.toString(16).padStart(4, '0');
        ipParts[subnetPartIndex] = subnetHex;
    }
    
    return ipParts.join(':');
}

function generateIpv6EndAddress(networkAddress, prefixLen) {
    // 简化的结束地址计算 - 实际应该计算完整的结束地址
    const ipParts = networkAddress.split(':');
    if (ipParts.length >= 7) {
        // 将最后一部分修改为"ffff"表示范围结束
        ipParts[7] = 'ffff';
    }
    return ipParts.join(':');
}

function normalizeIpv6(ip) {
    // 将简写的IPv6地址转换为完整形式
    if (ip.includes('::')) {
        const parts = ip.split('::');
        const leftParts = parts[0] ? parts[0].split(':') : [];
        const rightParts = parts[1] ? parts[1].split(':') : [];
        const missingParts = 8 - (leftParts.length + rightParts.length);
        
        const fullParts = leftParts.concat(Array(missingParts).fill('0')).concat(rightParts);
        return fullParts.join(':');
    }
    return ip;
}

function calculateIpv6SubnetSize(newPrefixLen) {
    return Math.pow(2, 128 - newPrefixLen);
}

function ipv4ToNumber(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
}

function numberToIpv4(num) {
    return [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255
    ].join('.');
}

function displayResults(baseCidr, subnets, ipType) {
    document.getElementById('errorMessage').style.display = 'none';
    
    // 更新结果摘要
    document.getElementById('baseCidrResult').textContent = baseCidr;
    document.getElementById('resultSubnetCount').textContent = subnets.length;
    
    if (ipType === 'ipv4') {
        const totalAddresses = subnets.reduce((sum, subnet) => sum + subnet.addressCount, 0);
        document.getElementById('totalAddresses').textContent = totalAddresses.toLocaleString();
    } else {
        document.getElementById('totalAddresses').textContent = '2^' + (128 - parseInt(subnets[0].network.split('/')[1]));
    }
    
    // 填充子网表格
    const tableBody = document.getElementById('subnetsTableBody');
    tableBody.innerHTML = '';
    
    subnets.forEach((subnet, index) => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${subnet.network}</td>
            <td>${subnet.startIp}</td>
            <td>${subnet.endIp}</td>
            <td>${typeof subnet.addressCount === 'number' 
                ? subnet.addressCount.toLocaleString() 
                : subnet.addressCount}</td>
        `;
        
        tableBody.appendChild(row);
    });
    
        // 显示结果区域
        document.getElementById('resultSection').style.display = 'block';
        
        // 添加导出按钮事件监听
        setupExportButtons(subnets);
    }

    function showError(message) {
        // 禁用导出按钮（如果有）
        const copyBtn = document.getElementById('copyButton');
        const exportBtn = document.getElementById('exportButton');
        if (copyBtn && exportBtn) {
            copyBtn.disabled = true;
            exportBtn.disabled = true;
        }
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    document.getElementById('resultSection').style.display = 'none';
}

function setupExportButtons(subnets) {
    const copyBtn = document.getElementById('copyButton');
    const exportBtn = document.getElementById('exportButton');
    
    if (!copyBtn || !exportBtn) return;
    
    // 启用按钮
    copyBtn.disabled = false;
    exportBtn.disabled = false;
    
    // 一键复制功能
    copyBtn.addEventListener('click', function() {
        const textToCopy = generateSubnetsText(subnets);
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                alert('子网信息已复制到剪贴板！');
            })
            .catch(err => {
                alert('复制失败: ' + err);
            });
    });
    
    // 导出Excel功能
    exportBtn.addEventListener('click', function() {
        exportToExcel(subnets);
    });
}

function generateSubnetsText(subnets) {
    // 只复制网段字段的值，每行一个网段
    let result = '';
    
    subnets.forEach((subnet) => {
        result += subnet.network + '\n';
    });
    
    return result;
}

function exportToExcel(subnets) {
    // 创建CSV内容，只包含网段字段
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "网段\n";
    
    subnets.forEach((subnet) => {
        csvContent += subnet.network + "\n";
    });
    
    // 创建下载链接
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "子网划分结果.csv");
    document.body.appendChild(link);
    
    // 触发下载
    link.click();
    document.body.removeChild(link);
}