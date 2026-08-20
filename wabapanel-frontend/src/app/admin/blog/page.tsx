'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, FileText, Eye, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import ImageUploadInput from '@/components/ui/ImageUploadInput';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Post {
  _id: string; title: string; slug: string; content: string; excerpt: string;
  coverImage: string; status: string; tags: string[]; author?: { name: string };
  metaTitle: string; metaDescription: string; publishedAt: string | null; createdAt: string;
}

const emptyForm = { title: '', content: '', excerpt: '', coverImage: '', status: 'draft', tags: '', metaTitle: '', metaDescription: '' };

export default function BlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchPosts = async () => {
    try {
      const res = await adminApi.getBlogPosts({});
      setPosts(res.data.data || []);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, []);

  const handleSave = async () => {
    if (!form.title) { toast.error('Title is required'); return; }
    try {
      const data = { ...form, tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [] };
      if (editPost) {
        await adminApi.updateBlogPost(editPost._id, data);
      } else {
        await adminApi.createBlogPost(data);
      }
      toast.success(editPost ? 'Updated' : 'Post created');
      setShowModal(false);
      fetchPosts();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this blog post?')) return;
    try { await adminApi.deleteBlogPost(id); toast.success('Deleted'); fetchPosts(); } catch { toast.error('Failed'); }
  };

  const toggleStatus = async (post: Post) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    try { await adminApi.updateBlogPost(post._id, { status: newStatus }); toast.success(`Post ${newStatus}`); fetchPosts(); } catch { toast.error('Failed'); }
  };

  const openEdit = (p: Post) => {
    setEditPost(p);
    setForm({
      title: p.title, content: p.content, excerpt: p.excerpt, coverImage: p.coverImage,
      status: p.status, tags: p.tags.join(', '), metaTitle: p.metaTitle, metaDescription: p.metaDescription,
    });
    setShowModal(true);
  };

  const openNew = () => { setEditPost(null); setForm(emptyForm); setShowModal(true); };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileText className="w-6 h-6 text-emerald-600" /> Blog Management</h1>
          <p className="text-sm text-gray-500 mt-1">Create, edit, and manage blog posts for your website</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openNew}>New Post</Button>
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> : posts.length === 0 ? (
        <div className="text-center py-10 text-gray-400">No blog posts yet. Create your first post!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map(post => (
            <div key={post._id} className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow">
              {post.coverImage && <img src={post.coverImage} alt={post.title} className="w-full h-40 object-cover" />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 line-clamp-2">{post.title}</h3>
                  <Badge variant={post.status === 'published' ? 'success' : 'default'}>{post.status}</Badge>
                </div>
                {post.excerpt && <p className="text-sm text-gray-500 line-clamp-2 mb-3">{post.excerpt}</p>}
                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {post.tags.map(tag => <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{tag}</span>)}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{post.author?.name || 'Admin'} | {new Date(post.createdAt).toLocaleDateString()}</span>
                  <div className="flex gap-1">
                    <button onClick={() => toggleStatus(post)} className="p-1.5 hover:bg-gray-100 rounded" title={post.status === 'published' ? 'Unpublish' : 'Publish'}>
                      {post.status === 'published' ? <EyeOff className="w-4 h-4 text-yellow-500" /> : <Eye className="w-4 h-4 text-emerald-500" />}
                    </button>
                    <button onClick={() => openEdit(post)} className="p-1.5 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={() => handleDelete(post._id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editPost ? 'Edit Blog Post' : 'New Blog Post'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Post title..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
            <textarea value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" rows={2} placeholder="Short summary..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" rows={8} placeholder="Full post content (HTML supported)..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ImageUploadInput label="Cover Image" value={form.coverImage} onChange={v => setForm({ ...form, coverImage: v })} folder="blog" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="feature, update, tutorial" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meta Title (SEO)</label>
              <input value={form.metaTitle} onChange={e => setForm({ ...form, metaTitle: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description (SEO)</label>
              <input value={form.metaDescription} onChange={e => setForm({ ...form, metaDescription: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editPost ? 'Update' : 'Create Post'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
