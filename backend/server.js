const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ========== 1. 获取分公司列表 ==========
app.get('/api/dashboard/branches', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                id, name, province, city, address,
                longitude, latitude, manager, phone, status, device_count
            FROM branches
        `);
        
        // 转换为前端需要的格式（添加 coord 坐标数组）
        const branches = rows.map(b => ({
            id: b.id,
            name: b.name,
            province: b.province,
            coord: b.longitude && b.latitude ? [b.longitude, b.latitude] : null,
            address: b.address,
            manager: b.manager,
            phone: b.phone,
            deviceCount: b.device_count,
            status: b.status
        }));
        
        res.json(branches);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 2. 获取项目列表 ==========
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        // 获取项目列表
        const [rows] = await pool.query(`
            SELECT 
                id, name, branch_id, manager_name as manager, status, progress, 
                device_count, user_count, fence_count, safety_days,
                longitude, latitude,
                center, area_boundary, zoom_level
            FROM projects
        `);
        
        // 获取平均工期
const [durationResult] = await pool.query(`
    SELECT ROUND(AVG(duration_days)) as avg_duration FROM projects WHERE duration_days IS NOT NULL
`);

        // 获取工人总数
        const [workerResult] = await pool.query(`
            SELECT COUNT(*) as total FROM personnel WHERE identity_level = 'worker'
        `);
        // 获取各项目工队数
const [teamCounts] = await pool.query(`
    SELECT project_id, COUNT(*) as count FROM teams GROUP BY project_id
`);
const teamCountMap = {};
teamCounts.forEach(t => { teamCountMap[t.project_id] = t.count; });

// 获取所有设备的坐标和在线状态

const [devices] = await pool.query(`
SELECT 
    d.id, 
    d.device_name as name, 
    d.device_type, 
    d.last_lng as lng, 
    d.last_lat as lat, 
    d.is_online,
    d.project_id,
    p.name as holder_name,
    p.phone as holder_phone
FROM devices d
LEFT JOIN personnel p ON d.holder_id = p.employee_code
WHERE d.last_lng IS NOT NULL AND d.last_lat IS NOT NULL
`);

// 按 project_id 分组
const devicesByProject = {};
devices.forEach(d => {
    if (!devicesByProject[d.project_id]) devicesByProject[d.project_id] = [];
    devicesByProject[d.project_id].push({
    id: d.id,
    name: d.name,
    type: d.device_type,
    lng: d.lng,
    lat: d.lat,
    is_online: d.is_online,
    holder_name: d.holder_name,
    holder_phone: d.holder_phone
    });
});

// 获取各项目专业数（工种数）
const [workTypeCounts] = await pool.query(`
    SELECT project_id, COUNT(DISTINCT work_type_id) as count 
    FROM personnel 
    WHERE identity_level = 'worker' AND work_type_id IS NOT NULL
    GROUP BY project_id
`);
const workTypeCountMap = {};
workTypeCounts.forEach(w => { workTypeCountMap[w.project_id] = w.count; });
        const projects = rows.map(p => ({
            id: p.id,
            name: p.name,
            branch_id: p.branch_id,
            manager: p.manager,
            status: p.status,
            progress: p.progress,
            deviceCount: p.device_count,
            userCount: p.user_count,
            fenceCount: p.fence_count,
            safetyDays: p.safety_days,
            longitude: p.longitude,
            latitude: p.latitude,
                        center: p.center,         
            area_boundary: p.area_boundary,  
            zoom_level: p.zoom_level,  
                teamCount: teamCountMap[p.id] || 0,
    workTypeCount: workTypeCountMap[p.id] || 0,
    devices: devicesByProject[p.id] || []
        }));
        
        // 返回项目列表 + 工人总数
        res.json({
            projects: projects,
            totalWorkers: workerResult[0].total,
            avgDuration: durationResult[0]?.avg_duration || 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});
// ========== 3. 获取告警列表 ==========
app.get('/api/dashboard/alarms', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `
            SELECT 
                a.id, a.alarm_type, a.severity, a.description, 
                a.location, a.status, a.created_at as timestamp,
                b.name as branch_name,
                p.name as project_name
            FROM alarms a
            LEFT JOIN branches b ON a.branch_id = b.id
            LEFT JOIN projects p ON a.project_id = p.id
            WHERE 1=1
        `;
        
        const params = [];
        if (branch_id) {
            sql += ` AND a.branch_id = ?`;
            params.push(branch_id);
        }
        if (project_id) {
            sql += ` AND a.project_id = ?`;
            params.push(project_id);
        }
        
        sql += ` ORDER BY a.created_at DESC LIMIT 20`;
        
        const [rows] = await pool.query(sql, params);
        
        const alarms = rows.map(a => ({
            id: a.id,
            severity: a.severity,
            alarm_type: a.alarm_type,
            description: a.description,
            branch_name: a.branch_name,
            status: a.status,
            timestamp: a.timestamp
        }));
        
        res.json(alarms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 4. 获取设备列表 ==========
app.get('/api/dashboard/devices', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `
            SELECT 
                id, device_code, device_name, device_type, 
                is_online, is_fault,  install_location,
                branch_id, project_id
            FROM devices
            WHERE 1=1
        `;
        
        const params = [];
        if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        if (project_id) {
            sql += ` AND project_id = ?`;
            params.push(project_id);
        }
        
        const [rows] = await pool.query(sql, params);
        
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 4.1 获取定位设备列表 ==========
app.get('/device/list', async (req, res) => {
    try {
        let sql = `
            SELECT 
                d.id,
                d.device_code as device_id,
                d.device_name as name,
                d.device_type as type,
                d.is_online,
                d.is_fault,
                d.install_location,
                d.remark,
                d.branch_id,
                d.project_id,
                d.grid_id,
                d.team_id,
                d.personnel_id,
                b.name as company,
                p.name as project,
                g.name as grid,
                t.name as team,
                d.created_at,
                d.updated_at
            FROM devices d
            LEFT JOIN branches b ON d.branch_id = b.id
            LEFT JOIN projects p ON d.project_id = p.id
            LEFT JOIN grids g ON d.grid_id = g.id
            LEFT JOIN teams t ON d.team_id = t.id
            WHERE d.device_type IN ('rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet')
            ORDER BY d.id DESC
        `;
        
        const [rows] = await pool.query(sql);
        
        // 转换为前端需要的格式
        const devices = rows.map(device => ({
            device_id: String(device.device_id || device.id),
            name: device.name,
            type: device.type,
            status: device.is_online ? 'online' : (device.is_fault ? 'fault' : 'offline'),
            company: device.company || '',
            branch_id: String(device.branch_id || ''),
            project: device.project || '',
            project_id: String(device.project_id || ''),
            grid: device.grid || '',
            grid_id: String(device.grid_id || ''),
            team: device.team || '',
            team_id: String(device.team_id || ''),
            personnel_id: String(device.personnel_id || ''),
            install_location: device.install_location || '',
            holder: device.team || '',
            holderPhone: '',
            phone_num: '',
            remark: device.remark || '',
            lastUpdate: device.updated_at,
            createdAt: device.created_at
        }));
        
        res.json(devices);
    } catch (error) {
        console.error('获取定位设备列表失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取所有摄像头设备（供 VideoCenter 使用）
// 获取摄像头设备（支持公司、项目筛选）
// 找到这个接口，替换成下面的代码
app.get('/api/devices', async (req, res) => {
    try {
        const { company, project } = req.query;
        
        let sql = `
            SELECT 
                d.id, 
                d.device_name as name, 
                d.device_type, 
                d.rtsp_url, 
                d.is_online as status,
                d.remark,
                d.created_at,
                d.device_code as device_serial,
                b.name as company,
                p.name as project
            FROM devices d
            LEFT JOIN branches b ON d.branch_id = b.id
            LEFT JOIN projects p ON d.project_id = p.id
            WHERE d.device_type IN ('bullet_camera', 'dome_camera', 'body_camera', 'drone')
        `;
        
        const params = [];
        
        if (company && company !== 'all') {
            sql += ` AND b.name = ?`;
            params.push(company);
        }
        if (project && project !== 'all') {
            sql += ` AND p.name = ?`;
            params.push(project);
        }
        
        sql += ` ORDER BY d.id DESC`;
        
        const [rows] = await pool.query(sql, params);
        
        // 转换成 VideoCenter 需要的格式
        const videos = rows.map(device => ({
            id: device.id,
            name: device.name,
            ip_address: '0.0.0.0',
            port: 80,
            rtsp_url: device.rtsp_url,
            status: device.status === 1 ? 'online' : 'offline',
            remark: device.remark,
            platform_type: 'ezviz',  // 萤石设备
            access_source: 'cloud',
            device_serial: device.device_serial,
            channel_no: 1
        }));
        
        res.json(videos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});
// ========== 5. 获取统计概览 ==========
app.get('/api/dashboard/statistics', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        // 设备统计
        let deviceSql = `SELECT COUNT(*) as total, SUM(is_online) as online FROM devices WHERE 1=1`;
        // 人员统计
        let personnelSql = `SELECT COUNT(*) as total, SUM(is_on_site) as on_site FROM personnel WHERE 1=1`;
        // 告警统计
        let alarmSql = `SELECT COUNT(*) as total, 
            SUM(CASE WHEN severity='HIGH' THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN severity='MEDIUM' THEN 1 ELSE 0 END) as medium,
            SUM(CASE WHEN severity='LOW' THEN 1 ELSE 0 END) as low,
            SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved
            FROM alarms WHERE 1=1`;
        
        const params = [];
        
        if (branch_id) {
            deviceSql += ` AND branch_id = ?`;
            personnelSql += ` AND branch_id = ?`;
            alarmSql += ` AND branch_id = ?`;
            params.push(branch_id, branch_id, branch_id);
        }
        if (project_id) {
            deviceSql += ` AND project_id = ?`;
            personnelSql += ` AND project_id = ?`;
            alarmSql += ` AND project_id = ?`;
            params.push(project_id, project_id, project_id);
        }
        
        const [deviceStats] = await pool.query(deviceSql, params.slice(0, 1));
        const [personnelStats] = await pool.query(personnelSql, params.slice(1, 2));
        const [alarmStats] = await pool.query(alarmSql, params.slice(2, 3));
        
        res.json({
            devices: {
                total: deviceStats[0]?.total || 0,
                online: deviceStats[0]?.online || 0
            },
            personnel: {
                total: personnelStats[0]?.total || 0,
                onSite: personnelStats[0]?.on_site || 0
            },
            alarms: {
                total: alarmStats[0]?.total || 0,
                high: alarmStats[0]?.high || 0,
                medium: alarmStats[0]?.medium || 0,
                low: alarmStats[0]?.low || 0,
                pending: alarmStats[0]?.pending || 0,
                resolved: alarmStats[0]?.resolved || 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/dashboard/attendance/today', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `
SELECT 
    COUNT(CASE WHEN type = 'in' THEN 1 END) as today_in,
    COUNT(CASE WHEN type = 'out' THEN 1 END) as today_out
FROM attendance_records
WHERE DATE(check_time) = CURDATE()
        `;
        const params = [];
        
        if (project_id) {
            sql += ` AND project_id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        
        const [rows] = await pool.query(sql, params);
        res.json(rows[0] || { today_in: 0, today_out: 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 7. 获取人员构成统计 ==========
app.get('/api/dashboard/personnel/stats', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `
            SELECT 
                identity_level as role,
                COUNT(*) as count
            FROM personnel
            WHERE 1=1
        `;
        const params = [];
        
        if (project_id) {
            sql += ` AND project_id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        
        sql += ` GROUP BY role`;
        
        const [rows] = await pool.query(sql, params);
        
        const stats = {
            management: 0,
            technical: 0,
            construction: 0,
            security: 0
        };
        
        rows.forEach(row => {
            if (row.role === 'management') stats.management = row.count;
            if (row.role === 'technical') stats.technical = row.count;
            if (row.role === 'construction') stats.construction = row.count;
            if (row.role === 'security') stats.security = row.count;
        });
        
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 8. 获取工种构成统计（新增）==========
app.get('/api/dashboard/personnel/job-stats', async (req, res) => {
    try {
        const { branch_id, project_id, detail_level = 'simple' } = req.query;
        
        let sql = `
            SELECT 
                role,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
            FROM personnel
            WHERE 1=1
        `;
        
        const params = [];
        
        if (project_id) {
            sql += ` AND project_id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        
        sql += ` GROUP BY role ORDER BY count DESC`;
        
        const [rows] = await pool.query(sql, params);
        
        // 角色中文映射
        const roleMap = {
            'management': '管理类',
            'technical': '技术类',
            'construction': '施工类',
            'security': '安保类',
            'other': '其他'
        };
        
        // 颜色配置
        const colorMap = {
            'management': '#3b82f6',
            'technical': '#10b981',
            'construction': '#f59e0b',
            'security': '#ef4444',
            'other': '#8b5cf6'
        };
        
        const formattedRows = rows.map(row => ({
            role: row.role,
            role_name: roleMap[row.role] || row.role,
            count: row.count,
            percentage: row.percentage,
            color: colorMap[row.role] || '#60a5fa'
        }));
        
        const total = formattedRows.reduce((sum, r) => sum + r.count, 0);
        
        res.json({
            total: total,
            categories: formattedRows,
            timestamp: new Date()
        });
        
    } catch (error) {
        console.error('工种统计错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 9. 获取详细职位统计（可选）==========
app.get('/api/dashboard/personnel/position-stats', async (req, res) => {
    try {
        const { branch_id, project_id, role } = req.query;
        
        let sql = `
            SELECT 
                role,
                position,
                COUNT(*) as count
            FROM personnel
            WHERE position IS NOT NULL AND position != ''
        `;
        
        const params = [];
        
        if (project_id) {
            sql += ` AND project_id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        
        if (role) {
            sql += ` AND role = ?`;
            params.push(role);
        }
        
        sql += ` GROUP BY role, position ORDER BY role, count DESC`;
        
        const [rows] = await pool.query(sql, params);
        
        // 按角色分组
        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.role]) {
                grouped[row.role] = [];
            }
            grouped[row.role].push({
                position: row.position,
                count: row.count
            });
        });
        
        res.json({
            total: rows.reduce((sum, r) => sum + r.count, 0),
            by_role: grouped,
            details: rows,
            timestamp: new Date()
        });
        
    } catch (error) {
        console.error('职位统计错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 10. 获取项目进度列表 ==========
app.get('/api/dashboard/projects/progress', async (req, res) => {
    try {
        const { branch_id } = req.query;
        
        let sql = `
            SELECT 
                id, name, progress, safety_days, status,
                branch_id,
                (SELECT name FROM branches WHERE id = projects.branch_id) AS branch_name
            FROM projects
            WHERE 1=1
        `;
        const params = [];
        
        if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        
        sql += ` ORDER BY progress DESC`;
        
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 11. 获取安全生产天数（全局最小值）==========
app.get('/api/dashboard/safety-days', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `SELECT MIN(safety_days) AS min_days FROM projects WHERE safety_days IS NOT NULL`;
        const params = [];
        
        if (project_id) {
            sql = `SELECT safety_days AS min_days FROM projects WHERE id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql = `SELECT MIN(safety_days) AS min_days FROM projects WHERE branch_id = ? AND safety_days IS NOT NULL`;
            params.push(branch_id);
        }
        
        const [rows] = await pool.query(sql, params);
        res.json({ safetyDays: rows[0]?.min_days || 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 12. 获取告警统计（Dashboard 专用）==========
app.get('/api/dashboard/alarms/statistics', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high,
                SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) AS medium,
                SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) AS low,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
                SUM(CASE WHEN DATE(alarm_time) = CURDATE() THEN 1 ELSE 0 END) AS today_new
            FROM alarms
            WHERE 1=1
        `;
        
        const params = [];
        
        if (project_id) {
            sql += ` AND project_id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        
        const [rows] = await pool.query(sql, params);
        const stats = rows[0];
        
        res.json({
            total: stats.total || 0,
            high: stats.high || 0,
            medium: stats.medium || 0,
            low: stats.low || 0,
            pending: stats.pending || 0,
            resolved: stats.resolved || 0,
            todayNew: stats.today_new || 0,
            resolveRate: stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 13. 获取设备分类统计 ==========
app.get('/api/dashboard/devices/statistics', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `
            SELECT 
                device_type,
                COUNT(*) AS total,
                SUM(is_online) AS online,
                SUM(is_fault) AS fault
            FROM devices
            WHERE 1=1
        `;
        
        const params = [];
        
        if (project_id) {
            sql += ` AND project_id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql += ` AND branch_id = ?`;
            params.push(branch_id);
        }
        
        sql += ` GROUP BY device_type`;
        
        const [rows] = await pool.query(sql, params);
        
        // 分类统计
        const cameras = ['bullet_camera', 'dome_camera', 'body_camera', 'drone'];
        const locations = ['rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet'];
        
        let cameraOnline = 0, cameraOffline = 0, cameraFault = 0;
        let locationOnline = 0, locationOffline = 0, locationFault = 0;
        
rows.forEach(row => {
    const onlineNum = Number(row.online) || 0;
    const faultNum = Number(row.fault) || 0;
    const totalNum = Number(row.total) || 0;
    const offlineNum = totalNum - onlineNum - faultNum;
    
    if (cameras.includes(row.device_type)) {
        cameraOnline += onlineNum;
        cameraOffline += offlineNum;
        cameraFault += faultNum;
    }
    if (locations.includes(row.device_type)) {
        locationOnline += onlineNum;
        locationOffline += offlineNum;
        locationFault += faultNum;
    }
});
        res.json({
            cameras: { online: cameraOnline, offline: cameraOffline, fault: cameraFault },
            locations: { online: locationOnline, offline: locationOffline, fault: locationFault }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 14. 获取今日告警详情列表（用于右侧滚动）==========
app.get('/api/dashboard/alarms/today', async (req, res) => {
    try {
        const { branch_id, project_id } = req.query;
        
        let sql = `
            SELECT 
                a.id,
                a.severity,
                a.status,
                a.alarm_time,
                a.location_desc,
                b.name AS behavior_name,
                p.name AS project_name,
                br.name AS branch_name
            FROM alarms a
            LEFT JOIN alarm_behavior_dict b ON a.behavior_code = b.code
            LEFT JOIN projects p ON a.project_id = p.id
            LEFT JOIN branches br ON a.branch_id = br.id
            WHERE DATE(a.alarm_time) = CURDATE()
        `;
        
        const params = [];
        
        if (project_id) {
            sql += ` AND a.project_id = ?`;
            params.push(project_id);
        } else if (branch_id) {
            sql += ` AND a.branch_id = ?`;
            params.push(branch_id);
        }
        
        sql += ` ORDER BY a.alarm_time DESC LIMIT 20`;
        
        const [rows] = await pool.query(sql, params);
        
        const severityMap = { 'high': 'HIGH', 'medium': 'MEDIUM', 'low': 'LOW' };
        
        const alarms = rows.map(a => ({
            id: a.id,
            severity: severityMap[a.severity] || a.severity?.toUpperCase(),
            alarm_type: a.behavior_name || '告警',
            description: a.behavior_name || '未知告警',
            branch_name: a.branch_name,
            status: a.status,
            timestamp: a.alarm_time
        }));
        
        res.json(alarms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 15. 获取项目工种构成（专业构成）==========
app.get('/api/dashboard/project/work-types', async (req, res) => {
    try {
        const { project_id } = req.query;
        
        if (!project_id) {
            return res.json([]);
        }
        
        const [rows] = await pool.query(`
            SELECT 
                wt.id,
                wt.name AS work_type_name,
                COUNT(p.id) AS count
            FROM work_types wt
            JOIN personnel p ON p.work_type_id = wt.id
            WHERE p.project_id = ? AND p.identity_level = 'worker'
            GROUP BY wt.id, wt.name
            ORDER BY count DESC
            LIMIT 4
        `, [project_id]);
        
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取设备已开启的规则
// 获取设备规则（合并版本）
app.get('/api/devices/:id/rules', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT active_rule_codes FROM devices WHERE id = ?',
            [req.params.id]
        );
        const rule_codes = rows[0]?.active_rule_codes ? JSON.parse(rows[0].active_rule_codes) : [];
        // 前端期望的是 { rules: [...] } 格式
        res.json({ rules: rule_codes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 更新设备开启的规则
app.put('/api/devices/:id/rules', async (req, res) => {
    const { rule_codes, rule_names } = req.body;
    await pool.query(
        'UPDATE devices SET active_rule_codes = ?, active_rules = ? WHERE id = ?',
        [JSON.stringify(rule_codes), JSON.stringify(rule_names), req.params.id]
    );
    res.json({ success: true });
});



// ========== 添加摄像头设备 ==========
app.post('/api/devices/camera', async (req, res) => {
    try {
        const {
            name,
            deviceCode,      // 萤石设备序列号
            channelNo,       // 通道号
            type,            // 设备类型
            location,        // 位置
            company,         // 分公司
            projectName,     // 项目名称
            admin,           // 管理员
            adminPhone,      // 管理员电话
            rtspUrl,         // 视频流地址
            remark           // 备注
        } = req.body;
        
        // 先获取或创建分公司
        let branchId = null;
        if (company) {
            let [branch] = await pool.query(
                'SELECT id FROM branches WHERE name = ?',
                [company]
            );
            if (branch.length === 0) {
                const [result] = await pool.query(
                    'INSERT INTO branches (name) VALUES (?)',
                    [company]
                );
                branchId = result.insertId;
            } else {
                branchId = branch[0].id;
            }
        }
        
        // 获取或创建项目
        let projectId = null;
        if (projectName) {
            let [project] = await pool.query(
                'SELECT id FROM projects WHERE name = ? AND branch_id = ?',
                [projectName, branchId]
            );
            if (project.length === 0) {
                const [result] = await pool.query(
                    'INSERT INTO projects (name, branch_id) VALUES (?, ?)',
                    [projectName, branchId]
                );
                projectId = result.insertId;
            } else {
                projectId = project[0].id;
            }
        }
        
        // 生成 rtspUrl（如果没有提供）
        const finalRtspUrl = rtspUrl || `rtsp://ezopen://open.ys7.com/${deviceCode}/${channelNo || 1}`;
        
        // 插入设备
        const [result] = await pool.query(`
            INSERT INTO devices (
                device_code, device_name, device_type, 
                rtsp_url, is_online, install_location,
                branch_id, project_id, remark,
                active_rules
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            deviceCode,
            name,
            type || 'bullet_camera',
            finalRtspUrl,
            1,  // is_online
            location || '',
            branchId,
            projectId,
            remark || '',
            JSON.stringify(['helmet', 'signage', 'supervisor_count'])  // 默认规则
        ]);
        
        res.json({
            success: true,
            id: result.insertId,
            message: '摄像头添加成功'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ========== 更新摄像头设备 ==========
app.put('/api/devices/camera/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            deviceCode,
            channelNo,
            type,
            location,
            company,
            projectName,
            admin,
            adminPhone,
            rtspUrl,
            status,
            remark
        } = req.body;
        
        const finalRtspUrl = rtspUrl || `rtsp://ezopen://open.ys7.com/${deviceCode}/${channelNo || 1}`;
        
        await pool.query(`
            UPDATE devices SET
                device_name = ?,
                device_code = ?,
                device_type = ?,
                rtsp_url = ?,
                is_online = ?,
                install_location = ?,
                remark = ?
            WHERE id = ?
        `, [
            name,
            deviceCode,
            type,
            finalRtspUrl,
            status === 'online' ? 1 : 0,
            location,
            remark,
            id
        ]);
        
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ========== 删除摄像头设备 ==========
app.delete('/api/devices/camera/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM devices WHERE id = ?', [id]);
        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ========== 预置点管理 ==========

// 获取预置点列表
app.get('/api/devices/:deviceId/presets', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const [rows] = await pool.query(
            'SELECT token, name, preset_index FROM device_presets WHERE device_id = ? ORDER BY preset_index',
            [deviceId]
        );
        res.json(rows);
    } catch (error) {
        console.error('获取预置点失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 创建预置点

app.post('/api/devices/:deviceId/presets', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { name } = req.body;
        
        console.log('=== 创建预置点 ===');
        console.log('deviceId:', deviceId);
        console.log('name:', name);
        
        // 直接用时间戳作为 token
        const token = String(Date.now());
        
        // 执行插入
        const [result] = await pool.query(
            'INSERT INTO device_presets (device_id, token, name) VALUES (?, ?, ?)',
            [deviceId, token, name || '预置点']
        );
        
        console.log('插入成功，影响行数:', result.affectedRows);
        
        // 返回给前端
        res.json({ 
            token: token, 
            name: name || '预置点' 
        });
        
    } catch (error) {
        console.error('创建预置点失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 调用预置点
app.post('/api/devices/:deviceId/presets/:token/move', async (req, res) => {
    try {
        const { deviceId, token } = req.params;
        
        // 获取预置点信息
        const [presetRow] = await pool.query(
            'SELECT preset_index FROM device_presets WHERE device_id = ? AND token = ?',
            [deviceId, token]
        );
        
        if (!presetRow[0]) {
            return res.status(404).json({ error: '预置点不存在' });
        }
        
        // 调用萤石云 API 转到预置点
        // const accessToken = await getEzvizAccessToken();
        // const [deviceRow] = await pool.query('SELECT device_code FROM devices WHERE id = ?', [deviceId]);
        // await fetch('https://open.ys7.com/api/lapp/device/preset/move', {
        //     method: 'POST',
        //     body: new URLSearchParams({
        //         accessToken: accessToken,
        //         deviceSerial: deviceRow[0].device_code,
        //         channelNo: 1,
        //         presetIndex: presetRow[0].preset_index
        //     })
        // });
        
        res.json({ success: true });
    } catch (error) {
        console.error('调用预置点失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 删除预置点
app.delete('/api/devices/:deviceId/presets/:token', async (req, res) => {
    try {
        const { deviceId, token } = req.params;
        
        // 先获取预置点信息，用于调用萤石 API 删除
        const [presetRow] = await pool.query(
            'SELECT preset_index FROM device_presets WHERE device_id = ? AND token = ?',
            [deviceId, token]
        );
        
        if (presetRow[0]) {
            // 调用萤石云 API 删除预置点
            // const accessToken = await getEzvizAccessToken();
            // const [deviceRow] = await pool.query('SELECT device_code FROM devices WHERE id = ?', [deviceId]);
            // await fetch('https://open.ys7.com/api/lapp/device/preset/delete', {
            //     method: 'POST',
            //     body: new URLSearchParams({
            //         accessToken: accessToken,
            //         deviceSerial: deviceRow[0].device_code,
            //         channelNo: 1,
            //         presetIndex: presetRow[0].preset_index
            //     })
            // });
        }
        
        // 从数据库删除
        await pool.query(
            'DELETE FROM device_presets WHERE device_id = ? AND token = ?',
            [deviceId, token]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('删除预置点失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量删除预置点
app.post('/api/devices/:deviceId/presets/bulk-delete', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { tokens } = req.body;
        
        if (!tokens || !tokens.length) {
            return res.status(400).json({ error: '请提供要删除的预置点 token 列表' });
        }
        
        const placeholders = tokens.map(() => '?').join(',');
        await pool.query(
            `DELETE FROM device_presets WHERE device_id = ? AND token IN (${placeholders})`,
            [deviceId, ...tokens]
        );
        
        res.json({ deleted_tokens: tokens, failed_tokens: [] });
    } catch (error) {
        console.error('批量删除预置点失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== 巡航管理 ==========

// 获取巡航状态
app.get('/api/devices/:deviceId/cruise/status', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const [row] = await pool.query(
            'SELECT preset_tokens, dwell_seconds, is_running FROM device_cruise_config WHERE device_id = ?',
            [deviceId]
        );
        
        if (row[0]) {
            res.json({
                running: row[0].is_running === 1,
                preset_tokens: JSON.parse(row[0].preset_tokens || '[]'),
                dwell_seconds: row[0].dwell_seconds
            });
        } else {
            res.json({ running: false, preset_tokens: [], dwell_seconds: 8 });
        }
    } catch (error) {
        console.error('获取巡航状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 启动巡航
app.post('/api/devices/:deviceId/cruise/start', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { preset_tokens, dwell_seconds, rounds } = req.body;
        
        // 保存巡航配置到数据库
        await pool.query(
            `INSERT INTO device_cruise_config (device_id, preset_tokens, dwell_seconds, is_running) 
             VALUES (?, ?, ?, 1) 
             ON DUPLICATE KEY UPDATE 
             preset_tokens = VALUES(preset_tokens), 
             dwell_seconds = VALUES(dwell_seconds), 
             is_running = 1`,
            [deviceId, JSON.stringify(preset_tokens), dwell_seconds]
        );
        
        // 这里需要调用萤石云 API 启动巡航（如果支持）
        // 否则前端需要轮询调用预置点
        
        res.json({ success: true });
    } catch (error) {
        console.error('启动巡航失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 停止巡航
app.post('/api/devices/:deviceId/cruise/stop', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        await pool.query(
            'UPDATE device_cruise_config SET is_running = 0 WHERE device_id = ?',
            [deviceId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('停止巡航失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== 启动服务器 ==========
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`后端服务运行在 http://localhost:${PORT}`);
});