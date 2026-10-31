import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'developer_dashboard_screen.dart';

void main() {
  runApp(const AlAlamiAqaratApp());
}

class AlAlamiAqaratApp extends StatefulWidget {
  const AlAlamiAqaratApp({super.key});

  @override
  State<AlAlamiAqaratApp> createState() => _AlAlamiAqaratAppState();
}

class _AlAlamiAqaratAppState extends State<AlAlamiAqaratApp> {
  bool _isDarkMode = true;
  double _fontScale = 1.0;

  @override
  void initState() {
    super.initState();
    // تفعيل الحماية البرمجية الفورية لمنع لقطات الشاشة أو التسجيل لخصوصية تامة
    SystemChannels.platform.invokeMethod(
      'SystemChrome.setEnabledSecureMask',
      true,
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'منصة العالمي للعقارات',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: _isDarkMode ? Brightness.dark : Brightness.light,
        primaryColor: const Color(0xFF1E3A8A),
        fontFamily: 'Cairo',
      ),
      home: Directionality(
        textDirection: TextDirection.rtl, // دعم كامل للغة العربية والواجهات
        child: AppHomeScreen(
          isDarkMode: _isDarkMode,
          onThemeChanged: (val) => setState(() => _isDarkMode = val),
          fontScale: _fontScale,
          onFontScaleChanged: (val) => setState(() => _fontScale = val),
        ),
      ),
    );
  }
}

class AppHomeScreen extends StatelessWidget {
  final bool isDarkMode;
  final ValueChanged<bool> onThemeChanged;
  final double fontScale;
  final ValueChanged<double> onFontScaleChanged;

  const AppHomeScreen({
    super.key,
    required this.isDarkMode,
    required this.onThemeChanged,
    required this.fontScale,
    required this.onFontScaleChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E3A8A),
        title: Text(
          'العالمي للعقارات الذكية 🏠',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 18 * fontScale,
            color: Colors.white,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'لوحة المطور',
            icon: const Icon(Icons.admin_panel_settings, color: Colors.white),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const DeveloperDashboardScreen(),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.text_increase, color: Colors.white),
            onPressed: () => onFontScaleChanged(
              fontScale + 0.1 <= 1.4 ? fontScale + 0.1 : 1.4,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.text_decrease, color: Colors.white),
            onPressed: () => onFontScaleChanged(
              fontScale - 0.1 >= 0.8 ? fontScale - 0.1 : 0.8,
            ),
          ),
          IconButton(
            icon: Icon(
              isDarkMode ? Icons.light_mode : Icons.dark_mode,
              color: Colors.white,
            ),
            onPressed: () => onThemeChanged(!isDarkMode),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'أهلاً بك في تطبيق الجوال الموحد والمصفى 🚀\nالمنصة مقسمة ومحمية بالكامل ضد تصوير الشاشة.',
              style: TextStyle(
                fontSize: 16 * fontScale,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 30),
            // أزرار محاكاة الأقسام الأربعة الكبرى تفاعلياً
            ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.gavel),
              label: const Text('دخول قسم المزادات الفورية'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.amber),
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.video_call),
              label: const Text('بدء اجتماع مرئي (زووم عقاري)'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.indigo),
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.live_tv),
              label: const Text('الانضمام للبث المباشر للعقارات'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            ),
          ],
        ),
      ),
    );
  }
}
