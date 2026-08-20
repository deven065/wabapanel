const ChatAppearance = require('../models/ChatAppearance');
const Workspace = require('../models/Workspace');

const getSettings = async (req, res) => {
  try {
    let settings = await ChatAppearance.findOne({ workspace: req.workspace._id });
    if (!settings) {
      settings = await ChatAppearance.create({ workspace: req.workspace._id });
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    let settings = await ChatAppearance.findOne({ workspace: req.workspace._id });
    if (!settings) {
      settings = await ChatAppearance.create({ workspace: req.workspace._id, ...req.body });
    } else {
      Object.assign(settings, req.body);
      await settings.save();
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getEmbedCode = async (req, res) => {
  try {
    const settings = await ChatAppearance.findOne({ workspace: req.workspace._id });
    if (!settings || !settings.enabled) {
      return res.status(400).json({ success: false, message: 'Widget is not enabled' });
    }
    const workspace = await Workspace.findById(req.workspace._id);
    const phoneNumber = workspace?.whatsapp?.phoneNumber?.replace(/[^0-9]/g, '') || '';
    const embedCode = `<!-- WabaPanel Chat Widget -->
<script>
(function(){
  var w=window,d=document;
  w.__wabaWidget={
    workspaceId:"${req.workspace._id}",
    phone:"${phoneNumber}",
    color:"${settings.widgetColor}",
    position:"${settings.position}",
    welcome:"${settings.welcomeMessage.replace(/"/g, '\\"')}",
    title:"${settings.headerTitle.replace(/"/g, '\\"')}",
    subtitle:"${settings.headerSubtitle.replace(/"/g, '\\"')}",
    avatar:"${settings.avatarUrl}",
    buttonText:"${settings.buttonText}",
    autoOpen:${settings.autoOpen},
    autoOpenDelay:${settings.autoOpenDelay},
    preChatForm:${settings.preChatForm?.enabled || false}
  };
  var s=d.createElement("script");
  s.src="${(process.env.BACKEND_URL || "https://api.wabapanel.com").replace(/\/$/, "")}/widget/chat.js";
  s.async=true;
  d.head.appendChild(s);
})();
</script>`;
    res.json({ success: true, data: { embedCode, phoneNumber } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPublicSettings = async (req, res) => {
  try {
    const settings = await ChatAppearance.findOne({ workspace: req.params.workspaceId });
    if (!settings || !settings.enabled) {
      return res.status(404).json({ success: false, message: 'Widget not found or disabled' });
    }
    const workspace = await Workspace.findById(req.params.workspaceId);
    const phoneNumber = workspace?.whatsapp?.phoneNumber?.replace(/[^0-9]/g, '') || '';
    res.json({
      success: true,
      data: {
        widgetColor: settings.widgetColor,
        position: settings.position,
        welcomeMessage: settings.welcomeMessage,
        headerTitle: settings.headerTitle,
        headerSubtitle: settings.headerSubtitle,
        avatarUrl: settings.avatarUrl,
        buttonText: settings.buttonText,
        buttonIcon: settings.buttonIcon,
        showOnMobile: settings.showOnMobile,
        autoOpen: settings.autoOpen,
        autoOpenDelay: settings.autoOpenDelay,
        phoneNumber,
        preChatForm: settings.preChatForm,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSettings, updateSettings, getEmbedCode, getPublicSettings };
