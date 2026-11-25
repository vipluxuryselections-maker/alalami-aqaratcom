import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_shell.dart';

const String baseUrl = 'https://alalami-aqaratcom.onrender.com';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AlAlamiAqaratApp());
}

class AlAlamiAqaratApp extends StatefulWidget {
  const AlAlamiAqaratApp({super.key});

  @override
  State<AlAlamiAqaratApp> createState() => _AlAlamiAqaratAppState();
}

class _AlAlamiAqaratAppState extends State<AlAlamiAqaratApp> {
  bool _isDarkMode = true;

  @override
  Widget build(BuildContext context) {
    final theme = ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF10B981),
        brightness: _isDarkMode ? Brightness.dark : Brightness.light,
      ),
      useMaterial3: true,
    );
    return MaterialApp(
      title: 'بورصة العالمي للأصول والعقارات',
      debugShowCheckedModeBanner: false,
      theme: theme,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: BourseAppShell(
          isDarkMode: _isDarkMode,
          onToggleTheme: () => setState(() => _isDarkMode = !_isDarkMode),
        ),
      ),
    );
  }
}

class BourseHome extends StatefulWidget {
  const BourseHome({
    required this.isDarkMode,
    required this.onToggleTheme,
    super.key,
  });

  final bool isDarkMode;
  final VoidCallback onToggleTheme;

  @override
  State<BourseHome> createState() => _BourseHomeState();
}

class _BourseHomeState extends State<BourseHome> {
  int _tabIndex = 0;
  bool _loadingProperties = false;
  bool _isAutoScrolling = true;
  bool _regularSubscription = false;
  bool _isDeveloperOwner = false;
  List<Map<String, dynamic>> _properties = [];
  List<Map<String, dynamic>> _targetedLeads = [];
  final ScrollController _showcaseController = ScrollController();
  final ImagePicker _imagePicker = ImagePicker();
  Timer? _autoScrollTimer;
  Timer? _resumeScrollTimer;

  final _propertyFormKey = GlobalKey<FormState>();
  final _propertyTitle = TextEditingController();
  final _propertyLocation = TextEditingController();
  final _propertyPrice = TextEditingController();
  final _propertyArea = TextEditingController();
  final _customCategory = TextEditingController();
  final _ownerType = TextEditingController();
  String _listingKind = 'real-estate';
  String _propertyCategory = 'فلل';
  String _dealPurpose = 'بيع';
  XFile? _video;
  bool _submittingProperty = false;

  final _leadFormKey = GlobalKey<FormState>();
  final _leadName = TextEditingController();
  final _leadPhone = TextEditingController();
  final _subscriptionCount = TextEditingController();
  final _leadRating = TextEditingController();
  String _leadStatus = 'غير مغلق';
  bool _submittingLead = false;

  final _complianceFormKey = GlobalKey<FormState>();
  final _dealPrice = TextEditingController();
  final _licenseNumber = TextEditingController();
  String _nationality = 'سعودي';
  String _dealLocation = 'الرياض';
  bool _submittingCompliance = false;
  bool _submittingMeeting = false;

  static const _propertyCategories = [
    'فلل',
    'أراضي',
    'شقق',
    'دور',
    'كمباوند',
    'أبراج',
    'قصور',
    'عمائر',
    'محلات',
    'أسواق تجارية',
    'مولات تجارية',
    'مكاتب إدارية',
    'شركات',
    'استراحات',
    'مزارع',
    'أخرى',
  ];

  static const _assetCategories = [
    'ذهب',
    'فضة',
    'نحاس',
    'حديد',
    'سكراب',
    'ألمنيوم',
    'مستودع',
    'مصنع',
    'بضائع مستوردة',
    'أخرى',
  ];

  @override
  void initState() {
    super.initState();
    _startAutoScroll();
    _loadProperties();
  }

  @override
  void dispose() {
    _autoScrollTimer?.cancel();
    _resumeScrollTimer?.cancel();
    _showcaseController.dispose();
    _propertyTitle.dispose();
    _propertyLocation.dispose();
    _propertyPrice.dispose();
    _propertyArea.dispose();
    _customCategory.dispose();
    _ownerType.dispose();
    _leadName.dispose();
    _leadPhone.dispose();
    _subscriptionCount.dispose();
    _leadRating.dispose();
    _dealPrice.dispose();
    _licenseNumber.dispose();
    super.dispose();
  }

  void _startAutoScroll() {
    _autoScrollTimer = Timer.periodic(const Duration(milliseconds: 40), (_) {
      if (!mounted || !_isAutoScrolling || !_showcaseController.hasClients) {
        return;
      }
      final position = _showcaseController.position;
      if (position.maxScrollExtent <= 0) return;
      if (position.pixels >= position.maxScrollExtent - 2) {
        _showcaseController.jumpTo(0);
      } else {
        _showcaseController.jumpTo(
          (position.pixels + 1.2).clamp(0, position.maxScrollExtent),
        );
      }
    });
  }

  void _pauseAutoScroll() {
    _resumeScrollTimer?.cancel();
    setState(() => _isAutoScrolling = false);
    _resumeScrollTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) setState(() => _isAutoScrolling = true);
    });
  }

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor:
              isError ? Colors.red.shade700 : Colors.green.shade700,
        ),
      );
  }

  Future<Map<String, dynamic>> _getJson(String path) async {
    final response = await http
        .get(Uri.parse('$baseUrl$path'))
        .timeout(const Duration(seconds: 25));
    return _decodeResponse(response);
  }

  Future<Map<String, dynamic>> _postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await http
        .post(
          Uri.parse('$baseUrl$path'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 45));
    return _decodeResponse(response);
  }

  Map<String, dynamic> _decodeResponse(http.Response response) {
    dynamic data;
    try {
      data = jsonDecode(response.body);
    } on FormatException {
      throw Exception('رد الخادم غير مفهوم (${response.statusCode}).');
    }
    if (data is! Map<String, dynamic>) {
      throw Exception('صيغة رد الخادم غير صالحة (${response.statusCode}).');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        data['message']?.toString() ??
            'تعذر تنفيذ الطلب (${response.statusCode}).',
      );
    }
    return data;
  }

  Future<void> _loadProperties() async {
    setState(() => _loadingProperties = true);
    try {
      final data = await _getJson('/api/ledger');
      final list = data['items'];
      if (list is List) {
        _properties = list
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      } else {
        _properties = [];
      }
    } catch (error) {
      _showMessage('تعذر جلب العقارات: $error', isError: true);
    } finally {
      if (mounted) setState(() => _loadingProperties = false);
    }
  }

  Future<void> _selectVideo(ImageSource source) async {
    try {
      final picked = await _imagePicker.pickVideo(
        source: source,
        maxDuration: const Duration(minutes: 2),
      );
      if (picked != null && mounted) setState(() => _video = picked);
    } catch (error) {
      _showMessage('تعذر اختيار الفيديو: $error', isError: true);
    }
  }

  Future<void> _submitProperty() async {
    if (!_propertyFormKey.currentState!.validate()) return;
    setState(() => _submittingProperty = true);
    try {
      final category = _propertyCategory == 'أخرى'
          ? _customCategory.text.trim()
          : _propertyCategory;
      final data = await _postJson('/api/ledger/add', {
        'itemType': _listingKind == 'real-estate' ? 'إعلان عقاري' : 'عرض أصل',
        'status': 'جديد',
        'assetCategory': category,
        'dealType': _dealPurpose,
        'title': _propertyTitle.text.trim(),
        'location': _propertyLocation.text.trim(),
        'price': _propertyPrice.text.trim(),
        'area': _propertyArea.text.trim().isEmpty
            ? 0
            : _propertyArea.text.trim(),
        'ownerType': _ownerType.text.trim(),
      });
      _showMessage(data['message']?.toString() ?? 'تم إرسال طلب إدراج العقار.');
      _propertyFormKey.currentState!.reset();
      _propertyTitle.clear();
      _propertyLocation.clear();
      _propertyPrice.clear();
      _propertyArea.clear();
      _customCategory.clear();
      _ownerType.clear();
      setState(() {
        _listingKind = 'real-estate';
        _propertyCategory = _propertyCategories.first;
        _dealPurpose = 'بيع';
        _video = null;
      });
      await _loadProperties();
    } catch (error) {
      _showMessage('تعذر إدراج العقار: $error', isError: true);
    } finally {
      if (mounted) setState(() => _submittingProperty = false);
    }
  }

  Future<void> _loadTargetedLeads() async {
    if (!_regularSubscription) {
      setState(() => _targetedLeads = []);
      return;
    }
    try {
      final data = await _postJson('/api/vip/targeted-leads', {
        'regularSubscription': true,
      });
      final leads = data['leads'] ?? data['targetedLeads'];
      if (leads is List) {
        setState(
          () => _targetedLeads = leads
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList(),
        );
      } else {
        setState(() => _targetedLeads = []);
        _showMessage(data['message']?.toString() ?? 'لا توجد نتائج مستهدفة.');
      }
    } catch (error) {
      _showMessage('تعذر جلب العملاء المستهدفين: $error', isError: true);
    }
  }

  Future<void> _submitLead() async {
    if (!_leadFormKey.currentState!.validate()) return;
    final subscriptions = int.tryParse(_subscriptionCount.text) ?? 0;
    final rating = int.tryParse(_leadRating.text);
    if (subscriptions == 5 && (rating == null || rating < 1 || rating > 5)) {
      _showMessage('التقييم مطلوب عند الوصول إلى 5 اشتراكات، من 1 إلى 5.',
          isError: true);
      return;
    }
    setState(() => _submittingLead = true);
    try {
      final data = await _postJson('/api/crm/leads/add', {
        'name': _leadName.text.trim(),
        'phone': _leadPhone.text.trim(),
        'status': _leadStatus,
        'subscriptions': subscriptions,
        if (subscriptions == 5) 'rating': rating,
      });
      _showMessage(data['message']?.toString() ?? 'تم تسجيل العميل.');
      _leadFormKey.currentState!.reset();
      _leadName.clear();
      _leadPhone.clear();
      _subscriptionCount.clear();
      _leadRating.clear();
      setState(() => _leadStatus = 'غير مغلق');
    } catch (error) {
      _showMessage('تعذر تسجيل العميل: $error', isError: true);
    } finally {
      if (mounted) setState(() => _submittingLead = false);
    }
  }

  Future<void> _submitCompliance() async {
    if (!_complianceFormKey.currentState!.validate()) return;
    final restrictedLocation =
        _dealLocation == 'مكة المكرمة' || _dealLocation == 'المدينة المنورة';
    if (_nationality != 'سعودي' && restrictedLocation && !_isDeveloperOwner) {
      _showMessage(
        'لا يمكن متابعة الطلب في مكة أو المدينة لغير السعودي دون تفعيل خيار المطور المالك.',
        isError: true,
      );
      return;
    }
    setState(() => _submittingCompliance = true);
    try {
      final data = await _postJson(
        '/api/compliance/validate-deal-flexible',
        {
          'assetType': 'realestate_sale',
          'price': _dealPrice.text.trim(),
          'userNationality': switch (_nationality) {
            'سعودي' => 'Saudi',
            'غير سعودي - خليجي' => 'Non-Saudi-GCC',
            _ => 'Non-Saudi-Foreign',
          },
          'propertyLocation': switch (_dealLocation) {
            'مكة المكرمة' => 'Makkah',
            'المدينة المنورة' => 'Madinah',
            _ => 'Other',
          },
          'licenseNumber': _licenseNumber.text.trim(),
          'isSuperDeveloperBypass': _isDeveloperOwner,
        },
      );
      _showMessage(data['message']?.toString() ?? 'تم تسجيل طلب الامتثال.');
    } catch (error) {
      _showMessage('تعذر إكمال طلب الامتثال: $error', isError: true);
    } finally {
      if (mounted) setState(() => _submittingCompliance = false);
    }
  }

  Future<void> _createMeeting() async {
    setState(() => _submittingMeeting = true);
    try {
      final data = await _postJson('/api/meetings/google-meet', {});
      final url = data['url']?.toString() ?? data['meetUrl']?.toString();
      if (url != null && url.isNotEmpty) {
        await _launchExternal(url);
      } else {
        _showMessage(
            data['message']?.toString() ?? 'لم يرجع الخادم رابط اجتماع.');
      }
    } catch (error) {
      _showMessage('تعذر إنشاء الاجتماع: $error', isError: true);
    } finally {
      if (mounted) setState(() => _submittingMeeting = false);
    }
  }

  Future<void> _launchExternal(String value) async {
    final uri = Uri.tryParse(value);
    if (uri == null || !await canLaunchUrl(uri)) {
      _showMessage('تعذر فتح الرابط المطلوب.', isError: true);
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _openAssistant() {
    final controller = TextEditingController();
    final messages = <Map<String, String>>[
      {
        'role': 'assistant',
        'text': 'مرحباً بك في المساعد الذكي العقاري. كيف أستطيع مساعدتك؟'
      },
    ];
    var sending = false;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: SizedBox(
            height: 420,
            child: Column(
              children: [
                const Text(
                  'المساعد الذكي العقاري',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                ),
                const Divider(),
                Expanded(
                  child: ListView(
                    children: messages
                        .map(
                          (message) => Align(
                            alignment: message['role'] == 'assistant'
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Card(
                              color: message['role'] == 'assistant'
                                  ? Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest
                                  : Theme.of(context)
                                      .colorScheme
                                      .primaryContainer,
                              child: Padding(
                                padding: const EdgeInsets.all(10),
                                child: Text(message['text']!),
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: controller,
                        decoration: const InputDecoration(
                          hintText: 'اكتب سؤالك',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: sending
                          ? null
                          : () async {
                              final prompt = controller.text.trim();
                              if (prompt.isEmpty) return;
                              setSheetState(() {
                                messages.add({'role': 'user', 'text': prompt});
                                controller.clear();
                                sending = true;
                              });
                              try {
                                final result = await _postJson(
                                  '/api/ai/assistant',
                                  {'prompt': prompt},
                                );
                                setSheetState(
                                  () => messages.add({
                                    'role': 'assistant',
                                    'text': result['reply']?.toString() ??
                                        result['message']?.toString() ??
                                        'وصل رد من الخادم بلا نص.',
                                  }),
                                );
                              } catch (error) {
                                setSheetState(
                                  () => messages.add({
                                    'role': 'assistant',
                                    'text': 'تعذر الاتصال بالمساعد: $error',
                                  }),
                                );
                              } finally {
                                setSheetState(() => sending = false);
                              }
                            },
                      icon: sending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    ).whenComplete(controller.dispose);
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      _buildExchangeTab(),
      _buildAddPropertyTab(),
      _buildVipTab(),
      _buildComplianceTab(),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'بورصة العالمي للأصول والعقارات',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            tooltip: widget.isDarkMode ? 'الوضع النهاري' : 'الوضع الليلي',
            onPressed: widget.onToggleTheme,
            icon: Icon(widget.isDarkMode ? Icons.light_mode : Icons.dark_mode),
          ),
          IconButton(
            tooltip: 'تحديث العقارات',
            onPressed: _loadProperties,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: tabs[_tabIndex],
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAssistant,
        icon: const Icon(Icons.smart_toy),
        label: const Text('المساعد الذكي'),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (index) => setState(() => _tabIndex = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.storefront), label: 'البورصة'),
          NavigationDestination(
              icon: Icon(Icons.add_home_work), label: 'إدراج عقار'),
          NavigationDestination(
              icon: Icon(Icons.people_alt), label: 'العملاء VIP'),
          NavigationDestination(
              icon: Icon(Icons.verified_user), label: 'الامتثال والبث'),
        ],
      ),
    );
  }

  Widget _buildExchangeTab() {
    return RefreshIndicator(
      onRefresh: _loadProperties,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            _isAutoScrolling
                ? 'عروض عقارية مميزة • تتحرك تلقائياً'
                : 'العروض متوقفة للقراءة',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 155,
            child: Listener(
              onPointerDown: (_) => _pauseAutoScroll(),
              child: _loadingProperties
                  ? const Center(child: CircularProgressIndicator())
                  : _properties.isEmpty
                      ? const Card(
                          child: Center(
                              child: Text('لا توجد عقارات معروضة حالياً.')),
                        )
                      : ListView.builder(
                          controller: _showcaseController,
                          scrollDirection: Axis.horizontal,
                          itemCount: _properties.length,
                          itemBuilder: (context, index) {
                            final property = _properties[index];
                            return SizedBox(
                              width: 260,
                              child: Card(
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: _propertySummary(property),
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ),
          const SizedBox(height: 16),
          Text('كافة العقارات', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          if (_loadingProperties && _properties.isEmpty)
            const Center(child: CircularProgressIndicator())
          else if (_properties.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(18),
                child: Text('ستظهر العقارات المسجلة هنا بعد جلبها من السيرفر.'),
              ),
            )
          else
            ..._properties.map(
              (property) => Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _propertySummary(property),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () =>
                                  _launchExternal('https://wa.me/966500000000'),
                              icon: const Icon(Icons.chat),
                              label: const Text('واتساب'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: FilledButton.tonalIcon(
                              onPressed: () => _launchExternal('tel:920000000'),
                              icon: const Icon(Icons.call),
                              label: const Text('اتصال'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _propertySummary(Map<String, dynamic> property) {
    final category =
        property['asset_category'] ?? property['category'] ?? 'عقار';
    final title = property['title'] ?? 'بدون عنوان';
    final location = property['location'] ?? 'غير محدد';
    final price = property['price'] ?? 'غير محدد';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        Text('$category • ${property['deal_type'] ?? 'بيع'}'),
        Text(
          title.toString(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        Text('الموقع: ${property['location'] ?? location}'),
        Text('السعر: $price ريال', style: const TextStyle(color: Colors.green)),
      ],
    );
  }

  Widget _buildAddPropertyTab() {
    return Form(
      key: _propertyFormKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('إدراج عقار جديد',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _listingKind,
            decoration: const InputDecoration(labelText: 'نوع السجل'),
            items: const [
              DropdownMenuItem(value: 'real-estate', child: Text('عقار')),
              DropdownMenuItem(value: 'asset', child: Text('أصل أو منشأة')),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _listingKind = value;
                _propertyCategory = value == 'real-estate'
                    ? _propertyCategories.first
                    : _assetCategories.first;
                _customCategory.clear();
              });
            },
          ),
          DropdownButtonFormField<String>(
            initialValue: _propertyCategory,
            decoration: const InputDecoration(labelText: 'التصنيف'),
            items: (_listingKind == 'real-estate'
                    ? _propertyCategories
                    : _assetCategories)
                .map((item) => DropdownMenuItem(value: item, child: Text(item)))
                .toList(),
            onChanged: (value) {
              if (value != null) setState(() => _propertyCategory = value);
            },
          ),
          if (_propertyCategory == 'أخرى')
            _textField(
              controller: _customCategory,
              label: 'اكتب نوع العقار',
              requiredField: true,
            ),
          DropdownButtonFormField<String>(
            initialValue: _dealPurpose,
            decoration: const InputDecoration(labelText: 'الغرض'),
            items: const [
              DropdownMenuItem(value: 'بيع', child: Text('بيع')),
              DropdownMenuItem(value: 'شراء', child: Text('شراء')),
              DropdownMenuItem(value: 'إيجار', child: Text('إيجار')),
              DropdownMenuItem(value: 'استثمار', child: Text('استثمار')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _dealPurpose = value);
            },
          ),
          _textField(
              controller: _propertyTitle,
              label: 'عنوان العقار',
              requiredField: true),
          _textField(
              controller: _propertyLocation,
              label: 'المدينة / الموقع',
              requiredField: true),
          _textField(
            controller: _propertyPrice,
            label: 'السعر بالريال',
            requiredField: true,
            keyboardType: TextInputType.number,
          ),
          _textField(
            controller: _propertyArea,
            label: 'المساحة (اختياري)',
            requiredField: false,
            keyboardType: TextInputType.number,
          ),
          _textField(
              controller: _ownerType, label: 'صفة المعلن', requiredField: true),
          const SizedBox(height: 12),
          Text(_video == null
              ? 'لم يتم اختيار فيديو'
              : 'الفيديو: ${_video!.name}'),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: () => _selectVideo(ImageSource.camera),
                icon: const Icon(Icons.videocam),
                label: const Text('تصوير فيديو'),
              ),
              OutlinedButton.icon(
                onPressed: () => _selectVideo(ImageSource.gallery),
                icon: const Icon(Icons.video_library),
                label: const Text('اختيار من الاستوديو'),
              ),
              if (_video != null)
                TextButton(
                  onPressed: () => setState(() => _video = null),
                  child: const Text('إزالة'),
                ),
            ],
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _submittingProperty ? null : _submitProperty,
            child: _submittingProperty
                ? const CircularProgressIndicator()
                : const Text('إرسال العقار للسحابة'),
          ),
        ],
      ),
    );
  }

  Widget _buildVipTab() {
    final subscriptions = int.tryParse(_subscriptionCount.text) ?? 0;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('بوابة العملاء VIP',
            style: Theme.of(context).textTheme.titleLarge),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('تفعيل الاشتراك المنتظم'),
          subtitle: const Text(
              'عند التفعيل يطلب التطبيق العملاء المستهدفين من السيرفر.'),
          value: _regularSubscription,
          onChanged: (value) {
            setState(() {
              _regularSubscription = value;
              if (!value) _targetedLeads = [];
            });
            if (value) _loadTargetedLeads();
          },
        ),
        if (_regularSubscription) ...[
          FilledButton.icon(
            onPressed: _loadTargetedLeads,
            icon: const Icon(Icons.search),
            label: const Text('عرض العملاء المستهدفين'),
          ),
          if (_targetedLeads.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('لا توجد نتائج مستهدفة لعرضها.'),
            )
          else
            ..._targetedLeads.map(
              (lead) => ListTile(
                leading: const Icon(Icons.person),
                title: Text('${lead['name'] ?? lead['title'] ?? 'عميل'}'),
                subtitle: Text('${lead['status'] ?? ''}'),
              ),
            ),
        ],
        const Divider(height: 32),
        Text('سجل المسوقين والعملاء',
            style: Theme.of(context).textTheme.titleMedium),
        Form(
          key: _leadFormKey,
          child: Column(
            children: [
              _textField(
                  controller: _leadName,
                  label: 'اسم العميل',
                  requiredField: true),
              _textField(
                controller: _leadPhone,
                label: 'رقم التواصل',
                requiredField: true,
                keyboardType: TextInputType.phone,
              ),
              DropdownButtonFormField<String>(
                initialValue: _leadStatus,
                decoration: const InputDecoration(labelText: 'حالة العميل'),
                items: const [
                  DropdownMenuItem(value: 'مغلق', child: Text('مغلق')),
                  DropdownMenuItem(value: 'غير مغلق', child: Text('غير مغلق')),
                ],
                onChanged: (value) {
                  if (value != null) setState(() => _leadStatus = value);
                },
              ),
              _textField(
                controller: _subscriptionCount,
                label: 'عدد الاشتراكات',
                requiredField: true,
                keyboardType: TextInputType.number,
              ),
              if (subscriptions == 5)
                _textField(
                  controller: _leadRating,
                  label: 'التقييم الإلزامي (من 1 إلى 5)',
                  requiredField: true,
                  keyboardType: TextInputType.number,
                ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _submittingLead ? null : _submitLead,
                child: _submittingLead
                    ? const CircularProgressIndicator()
                    : const Text('حفظ سجل العميل'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildComplianceTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('بوابة الامتثال', style: Theme.of(context).textTheme.titleLarge),
        Form(
          key: _complianceFormKey,
          child: Column(
            children: [
              DropdownButtonFormField<String>(
                initialValue: _nationality,
                decoration: const InputDecoration(labelText: 'الجنسية'),
                items: const [
                  DropdownMenuItem(value: 'سعودي', child: Text('سعودي')),
                  DropdownMenuItem(
                      value: 'غير سعودي - خليجي',
                      child: Text('غير سعودي - خليجي')),
                  DropdownMenuItem(
                      value: 'غير سعودي - أجنبي',
                      child: Text('غير سعودي - أجنبي')),
                ],
                onChanged: (value) {
                  if (value != null) setState(() => _nationality = value);
                },
              ),
              DropdownButtonFormField<String>(
                initialValue: _dealLocation,
                decoration: const InputDecoration(labelText: 'موقع العقار'),
                items: const [
                  DropdownMenuItem(value: 'الرياض', child: Text('الرياض')),
                  DropdownMenuItem(
                      value: 'مكة المكرمة', child: Text('مكة المكرمة')),
                  DropdownMenuItem(
                      value: 'المدينة المنورة', child: Text('المدينة المنورة')),
                  DropdownMenuItem(
                      value: 'مدينة أخرى', child: Text('مدينة أخرى')),
                ],
                onChanged: (value) {
                  if (value != null) setState(() => _dealLocation = value);
                },
              ),
              _textField(
                controller: _dealPrice,
                label: 'قيمة الصفقة بالريال',
                requiredField: true,
                keyboardType: TextInputType.number,
              ),
              _textField(
                controller: _licenseNumber,
                label: 'بيانات الترخيص',
                requiredField: true,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('أنا المطور المالك المخول'),
                subtitle: const Text(
                  'لا يتجاوز هذا الخيار تحقق الخادم أو المتطلبات النظامية.',
                ),
                value: _isDeveloperOwner,
                onChanged: (value) => setState(() => _isDeveloperOwner = value),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _submittingCompliance ? null : _submitCompliance,
                child: _submittingCompliance
                    ? const CircularProgressIndicator()
                    : const Text('إرسال طلب الامتثال'),
              ),
            ],
          ),
        ),
        const Divider(height: 36),
        Text('اجتماع فيديو', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        FilledButton.tonalIcon(
          onPressed: _submittingMeeting ? null : _createMeeting,
          icon: const Icon(Icons.video_call),
          label: Text(_submittingMeeting
              ? 'جارٍ الطلب...'
              : 'إنشاء اجتماع Google Meet'),
        ),
      ],
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String label,
    bool requiredField = false,
    TextInputType? keyboardType,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: TextFormField(
        controller: controller,
        keyboardType: keyboardType,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
        validator: (value) {
          if (requiredField && (value == null || value.trim().isEmpty)) {
            return 'هذا الحقل مطلوب';
          }
          if (keyboardType == TextInputType.number &&
              value != null &&
              value.trim().isNotEmpty &&
              double.tryParse(value.trim()) == null) {
            return 'أدخل رقماً صحيحاً';
          }
          return null;
        },
      ),
    );
  }
}
