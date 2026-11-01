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

class AppHomeScreen extends StatefulWidget {
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
  State<AppHomeScreen> createState() => _AppHomeScreenState();
}

class _AppHomeScreenState extends State<AppHomeScreen> {
  Future<void> showContractDialog(
    BuildContext context,
    String assetName,
    String contractDetails,
  ) async {
    final continueToPortal = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: Text(
            '📜 مسودة معلوماتية: $assetName',
            style: const TextStyle(color: Colors.greenAccent),
          ),
          content: SingleChildScrollView(
            child: Text(
              contractDetails,
              style: const TextStyle(
                fontSize: 14,
                color: Colors.white,
                height: 1.5,
              ),
            ),
          ),
          actions: [
            TextButton(
              style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('إلغاء'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
              ),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('قرأت المسودة وأتابع'),
            ),
          ],
        ),
      ),
    );

    if (!context.mounted || continueToPortal != true) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'تم اختيار متابعة العرض فقط. لم يتم توقيع عقد أو دفع مبلغ أو قفل صفقة.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E3A8A),
        title: Text(
          'العالمي للعقارات الذكية 🏠',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 18 * widget.fontScale,
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
            onPressed: () => widget.onFontScaleChanged(
              widget.fontScale + 0.1 <= 1.4 ? widget.fontScale + 0.1 : 1.4,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.text_decrease, color: Colors.white),
            onPressed: () => widget.onFontScaleChanged(
              widget.fontScale - 0.1 >= 0.8 ? widget.fontScale - 0.1 : 0.8,
            ),
          ),
          IconButton(
            icon: Icon(
              widget.isDarkMode ? Icons.light_mode : Icons.dark_mode,
              color: Colors.white,
            ),
            onPressed: () => widget.onThemeChanged(!widget.isDarkMode),
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
                fontSize: 16 * widget.fontScale,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 30),
            // أزرار محاكاة الأقسام الأربعة الكبرى تفاعلياً
            ElevatedButton.icon(
              onPressed: () => showContractDialog(
                context,
                'المزاد العقاري',
                'هذه مسودة معلوماتية لطلب المشاركة في مزاد عقاري. '
                    'يلزم التحقق من تفاصيل الأصل والتراخيص والشروط بواسطة مختص قبل أي التزام. '
                    'لا ينشئ العرض عقداً أو يثبت ملكية أو يخصم أي مبلغ.',
              ),
              icon: const Icon(Icons.gavel),
              label: const Text('دخول قسم المزادات الفورية'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.amber),
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              onPressed: () => showContractDialog(
                context,
                'الاجتماع المرئي العقاري',
                'هذا ملخص معلوماتي لطلب اجتماع لمناقشة أصل عقاري. '
                    'لا يمثل عقد وساطة أو تفويضاً، ولا يشارك بيانات خاصة أو ينشئ اجتماعاً فعلياً.',
              ),
              icon: const Icon(Icons.video_call),
              label: const Text('بدء اجتماع مرئي (زووم عقاري)'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.indigo),
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              onPressed: () => showContractDialog(
                context,
                'البث المباشر للعقارات',
                'هذا ملخص معلوماتي لطلب الانضمام إلى بث عقاري. '
                    'تخضع معلومات الأصل وأي متطلبات نظامية لمراجعة مستقلة. '
                    'المتابعة لا تعني اعتماداً أو توقيعاً أو فتح قناة تواصل.',
              ),
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
